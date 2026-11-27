<script lang="ts">
  import { t, locale, translate, type Locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { onDestroy } from 'svelte';
  import { snapshotError, downloadSnapshotBackup, snapshotsStore, refreshSnapshots, restoreSnapshot, restoreOnlineVersion, deleteAllSnapshots, type Snapshot } from '$lib/stores/versionHistory';
  import { onlineHistory, listOnlineVersions, type OnlineVersion } from '$lib/services/onlineHistory';
  import { VERSIONS_PAGE } from '../../../../functions/api/library/[id]/versions';
  import { currentProject } from '$lib/stores/project';
  import { get } from 'svelte/store';

  let { open = $bindable(false) } = $props();

  let snapshots: Snapshot[] = $state([]);
  onDestroy(snapshotsStore.subscribe(v => { snapshots = v; }));

  let online: OnlineVersion[] = $state([]);
  let onlineMore = $state(false);
  let onlineError = $state<string | null>(null);

  async function loadOnline(older: boolean) {
    const p = get(currentProject);
    if (!p) return;
    try {
      const page = await listOnlineVersions(p.id, older ? online.at(-1)?.seq : undefined);
      online = older ? [...online, ...page] : page;
      onlineMore = page.length === VERSIONS_PAGE;
      onlineError = null;
    } catch (error) { onlineError = error instanceof Error ? error.message : String(error); }
  }

  $effect(() => {
    if (open) {
      refreshSnapshots();
      if (onlineHistory) void loadOnline(false);
    }
  });

  async function onRestoreOnline(version: OnlineVersion) {
    const p = get(currentProject);
    if (!p) return;
    if (!confirm($t('versions.restoreConfirm'))) return;
    if (await restoreOnlineVersion(p.id, version.seq)) open = false;
  }

  function formatTime(ts: number, language: Locale): string {
    const d = new Date(ts);
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return translate(language, 'versions.now');
    if (diff < 3600) return translate(language, 'versions.minutes', { count: Math.floor(diff / 60) });
    if (diff < 86400) return translate(language, 'versions.hours', { count: Math.floor(diff / 3600) });
    return d.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en') + ' ' + d.toLocaleTimeString(language === 'pt' ? 'pt-BR' : 'en', { hour: '2-digit', minute: '2-digit' });
  }

  async function onRestore(index: number, snapshot: Snapshot) {
    const p = get(currentProject);
    if (!p) return;
    if (!confirm($t('versions.restoreConfirm'))) return;
    if (await restoreSnapshot(p.id, index, snapshot)) open = false;
  }

  async function onClearAll() {
    const p = get(currentProject);
    if (!p) return;
    if (!confirm($t('versions.clearConfirm'))) return;
    try { await deleteAllSnapshots(p.id); }
    catch { snapshotError.set($t('versions.clearFailed')); }
  }
  async function backupHistory() {
    const project = get(currentProject);
    if (!project) return;
    try { await downloadSnapshotBackup(project.id); }
    catch (error) { snapshotError.set(error instanceof Error ? error.message : $t('versions.backupFailed')); }
  }
</script>

{#if open}
<dialog use:modalDialog class="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center" aria-label={$t('versions.title')} onclick={(e) => { if (e.target === e.currentTarget) open = false; }} oncancel={(e) => { e.preventDefault(); open = false; }}>
  <div class="bg-white rounded-xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <h2 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        {$t('versions.title')}
      </h2>
      <button onclick={() => open = false} class="text-gray-400 hover:text-gray-600 transition-colors" aria-label={$t('versions.close')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    {#if $snapshotError}
      <div role="alert" class="mx-4 my-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
        <p>{projectServiceMessage($snapshotError, $locale)}</p>
        <button class="mt-2 underline font-semibold" onclick={backupHistory}>{$t('versions.backup')}</button>
      </div>
    {/if}
    <div class="flex-1 overflow-y-auto px-4 py-2">
      {#if snapshots.length === 0 && !$snapshotError}
        <p class="text-sm text-gray-400 text-center py-8">{$t('versions.empty')}<br>{$t('versions.interval')}</p>
      {:else}
        <div class="space-y-1">
          {#each [...snapshots].reverse() as snap, i}
            {@const realIndex = snapshots.length - 1 - i}
            <div role="group" aria-label={snap.description} class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 group transition-colors">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-700 truncate">{snap.description}</div>
                <div class="text-xs text-gray-400">{formatTime(snap.timestamp, $locale)}</div>
              </div>
              <button
                onclick={() => onRestore(realIndex, snap)}
                class="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors opacity-100 [@media(hover:hover)]:md:opacity-0 [@media(hover:hover)]:md:group-hover:opacity-100 focus-visible:opacity-100 font-medium shrink-0 ml-2"
              >
                {$t('versions.restore')}
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {#if onlineHistory}
        <section aria-label={$t('versions.online')} class="mt-3 border-t border-gray-100 pt-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{$t('versions.online')}</h3>
          <p class="text-xs text-gray-400 mb-1">{$t('versions.onlineNote')}</p>
          {#if onlineError}<p role="alert" class="text-sm text-red-700 py-2">{projectServiceMessage(onlineError, $locale)}</p>{/if}
          <div class="space-y-1">
            {#each online as version (version.seq)}
              <div role="group" aria-label={version.deleted ? $t('versions.onlineDeleted') : version.name} class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 group transition-colors">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-700 truncate">{version.deleted ? $t('versions.onlineDeleted') : version.name}</div>
                  <div class="text-xs text-gray-400">{formatTime(Date.parse(version.savedAt), $locale)}</div>
                </div>
                {#if !version.deleted}
                  <button
                    onclick={() => onRestoreOnline(version)}
                    class="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors opacity-100 [@media(hover:hover)]:md:opacity-0 [@media(hover:hover)]:md:group-hover:opacity-100 focus-visible:opacity-100 font-medium shrink-0 ml-2"
                  >
                    {$t('versions.restore')}
                  </button>
                {/if}
              </div>
            {/each}
          </div>
          {#if onlineMore}<button class="mt-1 text-xs font-semibold text-blue-600 underline" onclick={() => loadOnline(true)}>{$t('versions.older')}</button>{/if}
        </section>
      {/if}
    </div>

    {#if snapshots.length > 0 || $snapshotError}
      <div class="px-4 py-2 border-t border-gray-100">
        <button onclick={onClearAll} class="text-xs text-red-400 hover:text-red-600 transition-colors">
          {$t('versions.clear')}
        </button>
      </div>
    {/if}
  </div>
</dialog>
{/if}
