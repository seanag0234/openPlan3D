<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { listPeople, sharePlan, stopSharing, type PlanPeople } from '$lib/services/onlineHistory';
  import { modalDialog } from '$lib/utils/modalDialog';

  /** `onchanged` runs after every change, so the list can show who a plan is shared with. */
  let { id, name, onclose, onchanged }: { id: string; name: string; onclose: () => void; onchanged: () => Promise<void> } = $props();

  let people = $state<PlanPeople | null>(null);
  let email = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function run(change: () => Promise<void>) {
    busy = true; error = null;
    try { await change(); people = await listPeople(id); await onchanged(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { busy = false; }
  }

  $effect(() => {
    listPeople(id).then(found => { people = found; }, e => { error = e instanceof Error ? e.message : String(e); });
  });
</script>

<dialog use:modalDialog aria-labelledby="share-title" oncancel={(event) => { event.preventDefault(); if (!busy) onclose(); }}
  class="m-auto w-[28rem] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 text-gray-800 shadow-2xl backdrop:bg-black/50">
  <h2 id="share-title" class="text-lg font-semibold">{$t('library.shareTitle', { name: name || $t('library.untitled') })}</h2>
  {#if people === null && !error}
    <p role="status" class="mt-2 text-sm text-gray-500">{$t('library.shareLoading')}</p>
  {:else if people && people.owner === null}
    <p class="mt-2 text-sm text-gray-500">{$t('library.shareEveryone')}</p>
    <button type="button" disabled={busy} onclick={() => run(() => sharePlan(id))}
      class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{$t('library.makePrivate')}</button>
  {:else if people}
    <p class="mt-2 text-sm text-gray-500">{people.owner === people.you ? $t('library.shareHelp') : $t('library.sharedWithYou', { owner: people.owner ?? '' })}</p>
    <ul class="mt-3 divide-y divide-gray-100 text-sm">
      {#each people.people as person (person)}
        <li class="flex items-center justify-between gap-3 py-2">
          <span class="min-w-0 truncate">{person}</span>
          {#if people.owner === people.you}
            <button type="button" disabled={busy} onclick={() => run(() => stopSharing(id, person))}
              class="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{$t('library.stopSharing')}</button>
          {/if}
        </li>
      {:else}
        <li class="py-2 text-gray-400">{$t('library.sharedWithNobody')}</li>
      {/each}
    </ul>
    {#if people.owner === people.you}
      <form class="mt-3 flex gap-2" onsubmit={(event) => { event.preventDefault(); const to = email.trim(); if (to) void run(async () => { await sharePlan(id, to); email = ''; }); }}>
        <label for="share-email" class="sr-only">{$t('library.shareEmail')}</label>
        <input id="share-email" type="email" bind:value={email} disabled={busy} required placeholder={$t('library.shareEmail')}
          class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        <button type="submit" disabled={busy || !email.trim()} class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{$t('library.share')}</button>
      </form>
    {/if}
  {/if}
  {#if error}<p role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">{projectServiceMessage(error, $locale)}</p>{/if}
  <div class="mt-5 flex justify-end">
    <button type="button" onclick={onclose} disabled={busy} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">{$t('library.done')}</button>
  </div>
</dialog>

