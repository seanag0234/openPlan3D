import { writable, get } from 'svelte/store';
import { currentProject, historyForJournal, loadProject, restoreHistory } from './project';
import { buildJournal, journalFor, readUndoJournal, writeUndoJournal } from '$lib/services/undoJournal';
import { dataStore, storageErrorMessage, ProjectConflictError, LibraryLocalOnlyError, LIBRARY_WAITING, LIBRARY_SIGN_IN, PROJECTS_STORAGE_KEY, LIBRARY_CHANGE_KEY } from '$lib/services/datastore';
import { saveSnapshot } from '$lib/stores/versionHistory';
import type { Project } from '$lib/models/types';

export type SaveState = 'saved' | 'unsaved' | 'saving';

export const saveState = writable<SaveState>('saved');
export const lastSavedAt = writable<Date | null>(null);
export const saveError = writable<string | null>(null);
export const saveConflict = writable(false);
export const savingCopy = writable(false);
/** A short message about saving for the person editing, shown by SaveNotice. */
export const saveNotice = writable<'saving.caughtUp' | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let stopWatching: (() => void) | null = null;
let revision = 0;
let saveAttempt = 0;
let lastProjectId: string | undefined;
/** This tab has changes of its own that are not saved yet. */
let ownEdits = false;
/** The last save is in this browser only because the online library could not be reached. */
let waitingForSignal = false;
const RETRY_UPLOAD_MS = 30_000;
// Every edit restarts the wait, so a drag saves once it pauses rather than on every frame.
export const AUTOSAVE_DELAY_MS = 250;

/** One autosave owner per mounted editor. The caller must dispose on unmount. */
export function initAutoSave() {
  stopWatching?.();

  let first = true;
  let projectId = get(currentProject)?.id;
  const unsubscribe = currentProject.subscribe((_p) => {
    if (first) { first = false; return; }
    if (!_p) return;
    if (_p.id !== projectId) {
      projectId = _p.id;
      lastSavedAt.set(null);
      saveError.set(null);
      saveConflict.set(false);
    }
    markDirty();
  });
  let disposed = false;
  const checkCurrent = async () => {
    const project = get(currentProject);
    if (!project) return;
    const attempt = saveAttempt;
    try { await dataStore.assertCurrent(project.id); }
    catch (error) {
      if (disposed || get(currentProject) !== project || attempt !== saveAttempt) return;
      clearSaveTimer();
      saveAttempt++;
      saveState.set('unsaved');
      saveError.set(storageErrorMessage(error));
      saveConflict.set(error instanceof ProjectConflictError);
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PROJECTS_STORAGE_KEY && event.key !== LIBRARY_CHANGE_KEY) return;
    if (event.storageArea && event.storageArea !== localStorage) return;
    void checkCurrent();
  };
  // A page going away within the save wait leaves a copy the browser writes at once; the next load picks it up.
  const stashUnsaved = () => {
    try {
      const project = get(currentProject);
      if (!project || get(saveState) === 'saved' || get(saveConflict)) return;
      dataStore.stashUnsaved(project);
    } catch {}
  };
  // A tab that comes back with no change of its own catches up with a plan another tab saved meanwhile. A tab
  // with changes of its own keeps the bar that offers a copy or a file. Only coming back starts this: while the
  // tab stays in front, the bar appears as it always has.
  const catchUp = async () => {
    await checkCurrent();
    const project = get(currentProject);
    if (disposed || !project || !get(saveConflict) || ownEdits) return;
    const stored = await dataStore.load(project.id);
    // A plan deleted in another tab keeps the bar.
    if (!stored || disposed || get(currentProject) !== project || ownEdits) return;
    loadProject(stored);
    markClean();
    saveNotice.set('saving.caughtUp');
  };
  // A save that stayed in this browser for want of a signal goes online by itself: when the signal comes back,
  // when the tab comes back, and every half minute meanwhile. Nobody has to press Save. One saved by an earlier
  // page (reloaded with no signal) goes up from the browser's copy, as do other plans saved with no signal.
  const retryUpload = () => {
    if (disposed || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    if (!waitingForSignal) { dataStore.uploadPending?.(); return; }
    if (get(saveState) !== 'saved' || get(saveConflict)) return;
    void autoSave();
  };
  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') stashUnsaved();
    else if (document.visibilityState === 'visible') void catchUp().catch(() => {}).then(retryUpload);
  };
  const retryTimer = setInterval(retryUpload, RETRY_UPLOAD_MS);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', checkCurrent);
    window.addEventListener('pagehide', stashUnsaved);
    window.addEventListener('online', retryUpload);
  }
  // The document listened to, kept so `stop` removes from the same one.
  const doc = typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : null;
  doc?.addEventListener('visibilitychange', onVisibility);
  const stop = () => {
    disposed = true;
    unsubscribe();
    clearSaveTimer();
    clearInterval(retryTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', checkCurrent);
      window.removeEventListener('pagehide', stashUnsaved);
      window.removeEventListener('online', retryUpload);
    }
    try { doc?.removeEventListener('visibilitychange', onVisibility); } catch {}
    if (stopWatching === stop) stopWatching = null;
  };
  stopWatching = stop;
  return stop;
}

function clearSaveTimer() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
}

/** Mark project as dirty (unsaved). */
export function markDirty() {
  revision++;
  ownEdits = true;
  saveState.set('unsaved');
  clearSaveTimer();
  if (get(saveConflict)) return;
  debounceTimer = setTimeout(() => {
    void autoSave();
  }, AUTOSAVE_DELAY_MS);
}

function captureThumbnail(projectId: string) {
  try {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const size = 300;
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = Math.round(size * (canvas.height / canvas.width));
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    const dataUrl = tmp.toDataURL('image/jpeg', 0.6);
    dataStore.saveThumbnail(projectId, dataUrl);
  } catch {}
}

function scheduleThumbnail(project: Project) {
  const renderedRevision = revision, attempt = saveAttempt;
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (attempt === saveAttempt && renderedRevision === revision && get(currentProject) === project) {
      captureThumbnail(project.id);
    }
  }));
}

/** Saves remain local; failures leave the current project available for export. */
async function persist(manual: boolean): Promise<boolean> {
  clearSaveTimer();
  const p = get(currentProject);
  if (!p) return false;
  if (lastProjectId !== p.id) {
    lastSavedAt.set(null);
    saveError.set(null);
    saveConflict.set(false);
    lastProjectId = p.id;
  }
  const savingRevision = revision;
  const attempt = ++saveAttempt;
  saveState.set('saving');
  try {
    // The browser copy is saved even when the online library is not; the next save uploads it.
    let notice: string | null = null;
    try { await dataStore.save(p); }
    catch (e) { if (!(e instanceof LibraryLocalOnlyError)) throw e; notice = e.message; }
    // A completed write must not mark newer edits or another project as saved.
    if (attempt === saveAttempt && savingRevision === revision && get(currentProject) === p) {
      // The canvas may still show the previous plan immediately after an import.
      // Let reactive updates, zoom-to-fit and a paint finish before taking a preview.
      // Preview work must not delay the save or capture a newer revision/project.
      scheduleThumbnail(p);
      if (manual) saveSnapshot(p, 'Manual save', true);   // true: skip a plan equal to the newest version
      saveState.set('saved');
      saveError.set(notice);
      saveConflict.set(false);
      lastSavedAt.set(new Date());
      ownEdits = false;
      waitingForSignal = notice === LIBRARY_WAITING || notice === LIBRARY_SIGN_IN;
      keepUndoSteps(p);
    }
    return true;
  } catch (e) {
    if (attempt === saveAttempt && get(currentProject) === p) {
      saveState.set('unsaved');
      saveError.set(storageErrorMessage(e));
      saveConflict.set(e instanceof ProjectConflictError);
    }
    return false;
  }
}

export function autoSave() { return persist(false); }

/** Manual save */
export function manualSave() { return persist(true); }

/** Preserve this tab's version under a fresh ID before changing editor state. */
export async function saveCurrentAsCopy(): Promise<boolean> {
  if (get(savingCopy)) return false;
  const project = get(currentProject);
  if (!project) return false;
  clearSaveTimer();
  saveAttempt++;
  const copyingRevision = revision;
  savingCopy.set(true);
  try {
    const copy = await dataStore.saveCopy(project);
    if (get(currentProject)?.id !== project.id) return false;
    if (revision !== copyingRevision || get(currentProject) !== project) {
      if (get(saveState) !== 'saved') saveError.set('A copy was saved, but you made more edits while it was saving. Save another copy to keep the latest version.');
      return false;
    }
    loadProject(copy);
    markClean();
    lastSavedAt.set(new Date());
    scheduleThumbnail(copy);
    return true;
  } catch (error) {
    if (get(currentProject)?.id === project.id) saveError.set(storageErrorMessage(error));
    return false;
  } finally { savingCopy.set(false); }
}

/** Write the newest Undo steps beside the plan just saved, so a reload can give them back. Never waits or throws. */
function keepUndoSteps(p: Project) {
  try {
    const history = historyForJournal();
    if (!history) return;
    const journal = buildJournal({ ...history, planUpdatedAt: new Date(p.updatedAt).toISOString(), now: Date.now(), keepEmpty: true });
    void writeUndoJournal(p.id, journal).catch(() => {});
  } catch {}
}

/** Give the plan just loaded the Undo steps it had before the page was reloaded. Never waits or throws. */
function recallUndoSteps() {
  try {
    const project = get(currentProject);
    if (!project) return;
    void readUndoJournal(project.id).then(journal => {
      if (get(currentProject) !== project) return;
      const steps = journalFor(journal, new Date(project.updatedAt).toISOString());
      if (steps) restoreHistory(steps);
      // A plan with no steps kept for it gets the plan itself, so a change lost to a reload in the next second
      // (left behind with stashUnsaved) still has a step to go back to.
      else if (get(saveState) === 'saved') keepUndoSteps(project);
    }).catch(() => {});
  } catch {}
}

/** Call after loading a project that is already persisted. */
export function markClean() {
  clearSaveTimer();
  revision++;
  saveAttempt++;
  saveState.set('saved');
  saveError.set(null);
  saveConflict.set(false);
  lastSavedAt.set(null);
  lastProjectId = get(currentProject)?.id;
  ownEdits = false;
  waitingForSignal = false;
  recallUndoSteps();
}
