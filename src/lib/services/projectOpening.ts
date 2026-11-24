import { get } from 'svelte/store';
import type { Project } from '$lib/models/types';
import { currentProject, loadProject } from '$lib/stores/project';
import { autoSave, markClean, saveError, saveState } from '$lib/stores/saveStatus';
import { applyDisplaySettings } from '$lib/stores/settings';
import { readProject } from '$lib/utils/projectValidation';
import { localStore, ProjectConflictError } from './datastore';
import { prepareToLeave } from './deployment';
import { isLibraryBackup, LibraryBackupFileError } from './libraryRestore';
import { isRoomPlanJson } from '$lib/utils/roomplanValidation';
import { importQuestion, type ImportAnswer } from '$lib/stores/ui';
import { saveSnapshot } from '$lib/stores/versionHistory';

let latestRequest = 0;

/** An ID the library lacks stays taken while this tab remembers a revision of it: the store refuses to recreate a deleted plan. */
async function taken(id: string): Promise<boolean> {
  if (await localStore.has(id)) return true;
  try { await localStore.assertCurrent(id); return false; }
  catch (error) { if (error instanceof ProjectConflictError) return true; throw error; }
}

/** Validate first, preserve the current plan, then open a separate local project. */
export async function openProject(
  readCandidate: () => unknown | Promise<unknown>,
  kind: 'import' | 'new' = 'import',
  signal?: AbortSignal,
): Promise<Project | null> {
  const request = ++latestRequest;
  const originId = get(currentProject)?.id;
  const superseded = () => signal?.aborted || request !== latestRequest || get(currentProject)?.id !== originId;
  try {
    if (signal?.aborted) return null;
    const candidate = readProject(await readCandidate());
    if (superseded()) return null;
    const previous = get(currentProject);
    if (!await prepareToLeave()) {
      if (superseded()) return null;
      throw new Error(`Your current plan could not be saved. ${get(saveError) ?? 'Retry saving or download a JSON backup before opening another plan.'}`);
    }
    if (superseded()) return null;
    // Test existence without decoding a damaged entry: importing a recovery file
    // must preserve those original bytes, too. A plan this tab opened that was
    // deleted since (here or in another tab) cannot be saved under its old ID
    // again, so its backup imports as a copy.
    const newId = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let collision = candidate.id === previous?.id;
    let storageReadable = true;
    try { collision = await taken(candidate.id) || collision; }
    catch { storageReadable = false; }
    if (collision || !storageReadable) {
      let attempts = 0;
      do {
        if (++attempts > 5) throw new Error('Could not choose a new project ID. Try opening the file again.');
        candidate.id = newId();
      } while (storageReadable && await taken(candidate.id));
      if (collision) candidate.name = `${candidate.name || 'Untitled Project'} (${kind === 'import' ? 'Imported copy' : 'Copy'})`;
      candidate.createdAt = new Date();
    }
    if (superseded()) return null;
    if (get(currentProject) !== previous || get(saveState) !== 'saved') {
      throw new Error('Your plan changed while preparing to open another one. Try again so the latest edits can be saved first.');
    }
    candidate.updatedAt = new Date();
    loadProject(candidate);
    // Only on import: reopening a library plan must not overwrite a later choice made in Settings.
    if (kind === 'import' && candidate.displaySettings) applyDisplaySettings(candidate.displaySettings);
    // A candidate that cannot fit in storage is still available for local export.
    // The previously saved plan stays in the library and normal save feedback applies.
    await autoSave();
    return !signal?.aborted && request === latestRequest && get(currentProject)?.id === candidate.id ? candidate : null;
  } catch (error) {
    if (signal?.aborted || request !== latestRequest) return null;
    throw error;
  }
}

/** Open a project the library already holds (an imported package copy), after saving the current plan. */
export async function openStoredProject(id: string, signal?: AbortSignal): Promise<Project | null> {
  const request = ++latestRequest;
  const superseded = () => signal?.aborted || request !== latestRequest;
  try {
    const project = await localStore.load(id);
    if (superseded()) return null;
    if (!project) throw new Error('This project is no longer in your library.');
    if (!await prepareToLeave()) {
      if (superseded()) return null;
      throw new Error(`Your current plan could not be saved. ${get(saveError) ?? 'Retry saving or download a JSON backup before opening another plan.'}`);
    }
    if (superseded()) return null;
    if (get(saveState) !== 'saved') throw new Error('Your plan changed while preparing to open another one. Try again so the latest edits can be saved first.');
    loadProject(project);
    markClean();
    return project;
  } catch (error) {
    if (superseded()) return null;
    throw error;
  }
}

/** Read a file the person chose into what openProject takes. Throws LibraryBackupFileError for a backup of every plan. */
export async function readPlanFile(file: File): Promise<unknown> {
  let data: unknown;
  // Each browser words a file that is not JSON its own way: say it once, in the editor's words, and keep theirs after.
  try { data = JSON.parse(await file.text()); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid project: the file is not valid JSON. ${error.message}`);
    throw error;
  }
  // A library backup holds every project: Restore previews it and adds them as copies.
  if (isLibraryBackup(data)) throw new LibraryBackupFileError();
  if (!isRoomPlanJson(data)) return data;
  const [{ createProjectFromRoomPlan }, { interchangeProjectName }] = await Promise.all([import('$lib/utils/roomplanImport'), import('$lib/utils/interchange')]);
  return createProjectFromRoomPlan(data, interchangeProjectName(data, file.name.replace(/\.json$/i, '')));
}

/** The plan as text without the moments it was made and last saved: two files of the same plan compare equal. */
function content(project: Project): string {
  const { createdAt: _created, updatedAt: _updated, ...rest } = project;
  return JSON.stringify(rest);
}

/** "Room (2)" and "Room" both give "Room"; the first of "Room (2)", "Room (3)"… the list does not hold. */
async function nextFreeName(name: string): Promise<string> {
  const base = (name || 'Untitled Project').replace(/ \(\d+\)$/, '');
  const taken = new Set((await localStore.list()).map(item => item.name));
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** Open a plan the person chose. A plan already in the list is opened as it is when the file matches it, and asked about when it differs. */
export async function openPlanFile(readCandidate: () => unknown | Promise<unknown>, signal?: AbortSignal): Promise<Project | null> {
  if (signal?.aborted) return null;
  const candidate = readProject(await readCandidate());
  if (signal?.aborted) return null;
  if (!await prepareToLeave()) {
    if (signal?.aborted) return null;
    throw new Error(`Your current plan could not be saved. ${get(saveError) ?? 'Retry saving or download a JSON backup before opening another plan.'}`);
  }
  if (signal?.aborted) return null;
  if (!(await localStore.has(candidate.id))) return openProject(() => candidate, 'import', signal);

  const stored = await localStore.load(candidate.id);
  if (!stored) return openProject(() => candidate, 'import', signal);
  if (content(stored) === content(candidate)) return openStoredProject(candidate.id, signal);

  const answer = await new Promise<ImportAnswer>(resolve => importQuestion.set({ name: stored.name, resolve }));
  importQuestion.set(null);
  if (answer === 'cancel' || signal?.aborted) return null;
  if (answer === 'copy') {
    candidate.id = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    candidate.name = await nextFreeName(candidate.name);
    candidate.createdAt = new Date();
    return openProject(() => candidate, 'import', signal);
  }
  // Replace: the plan she had stays in its list of versions.
  await saveSnapshot(stored, 'Before replacing with a file', true);
  if (signal?.aborted) return null;
  candidate.updatedAt = new Date();
  loadProject(candidate);
  if (candidate.displaySettings) applyDisplaySettings(candidate.displaySettings);
  await autoSave();
  return candidate;
}
