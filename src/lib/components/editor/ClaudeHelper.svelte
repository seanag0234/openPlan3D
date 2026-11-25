<script lang="ts">
  import type Anthropic from '@anthropic-ai/sdk';
  import { t } from '$lib/i18n';
  import { coarsePointer } from '$lib/stores/pointer';
  import { claudeSettings, viaOpenRouter } from '$lib/stores/aiKeys';
  import { runTurn, pendingChange, type ChatEntry } from '$lib/services/claudeHelper';

  let open = $state(false);
  let entries = $state<ChatEntry[]>([]);
  let draft = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let list = $state<HTMLElement>();
  let controller: AbortController | null = null;
  // The conversation as the API sees it, tool calls included; the chat shows only what she needs.
  const history: Anthropic.Beta.BetaMessageParam[] = [];

  const scrollDown = () => queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));

  // The state array wraps what it holds, so an entry the loop updates later is found by where it was put.
  const placed = new Map<ChatEntry, number>();
  function show(entry: ChatEntry) {
    const at = placed.get(entry);
    if (at !== undefined) entries[at] = { ...entry };
    else { placed.set(entry, entries.length); entries.push({ ...entry }); }
    scrollDown();
  }

  function explain(e: unknown) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) return $t('panels.askBadKey');
    if (status === 429) return $t('panels.askBusy');
    if ((e as Error)?.name === 'AbortError' || /abort/i.test(String((e as Error)?.name))) return null;
    return $t('panels.askFailed', { detail: e instanceof Error ? e.message : String(e) });
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || !$claudeSettings.apiKey) return;
    draft = ''; error = null; busy = true;
    entries.push({ kind: 'user', text });
    scrollDown();
    const before = history.length;
    history.push({ role: 'user', content: text });
    controller = new AbortController();
    try {
      await runTurn($claudeSettings, history, show, controller.signal);
    } catch (e) {
      // An unfinished turn leaves the history as it was, so the next question starts clean.
      history.length = before;
      error = explain(e);
    } finally {
      $pendingChange?.answer(false);
      busy = false; controller = null;
      scrollDown();
    }
  }

  function stop() { controller?.abort(); $pendingChange?.answer(false); }
</script>

<button
  class="max-md:hidden pointer-events-auto {$coarsePointer ? 'w-11 min-h-[44px] rounded-lg flex flex-col items-center justify-center' : 'w-8 h-8 rounded-full text-sm'} shadow-lg transition-colors {open ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-100 hover:bg-slate-600'}"
  aria-label={$t('panels.askTitle')} title={$t('panels.askTitle')} aria-expanded={open} data-tour="ask"
  onclick={() => open = !open}
>{#if $coarsePointer}<span class="text-lg leading-none" aria-hidden="true">✨</span><span class="text-xs leading-tight tracking-tight">{$t('panels.ask')}</span>{:else}✨{/if}</button>

{#if open}
  <section aria-label={$t('panels.askTitle')}
    class="pointer-events-auto fixed bottom-16 {$coarsePointer ? 'left-14' : 'left-4'} z-50 w-96 max-w-[calc(100vw-5rem)] h-[min(32rem,70vh)] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col">
    <header class="flex items-center justify-between px-3 pt-2">
      <h2 class="text-sm font-semibold text-gray-800">{$t('panels.askTitle')}</h2>
      <button class="min-w-[44px] min-h-[44px] -mr-2 text-gray-400 hover:text-gray-600 text-lg" aria-label={$t('panels.askClose')} onclick={() => open = false}>✕</button>
    </header>
    {#if !$claudeSettings.apiKey}
      <p class="px-3 pb-3 text-sm text-gray-700">{$t('panels.askNoKey')}</p>
    {:else}
      <p class="px-3 text-xs text-gray-500">{$t('panels.askDisclosure', { provider: viaOpenRouter($claudeSettings.apiKey) ? 'OpenRouter' : 'Anthropic' })}</p>
      <div bind:this={list} class="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-2" aria-live="polite">
        {#if !entries.length}<p class="text-sm text-gray-500">{$t('panels.askHint')}</p>{/if}
        {#each entries as entry, i (i)}
          {#if entry.kind === 'user'}
            <p class="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 text-white px-3 py-2 text-base whitespace-pre-wrap">{entry.text}</p>
          {:else if entry.kind === 'claude'}
            <p class="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 px-3 py-2 text-base whitespace-pre-wrap">{entry.text}</p>
          {:else if entry.kind === 'change'}
            <div class="self-stretch rounded-xl border border-amber-300 bg-amber-50 px-3 py-2" data-testid="claude-change">
              <p class="text-base text-gray-800">{entry.summary}</p>
              {#if entry.outcome === 'waiting' && $pendingChange}
                <div class="mt-2 flex gap-2">
                  <button class="min-h-[44px] px-5 rounded-full bg-blue-600 text-white font-semibold" onclick={() => $pendingChange?.answer(true)}>{$t('panels.askDoIt')}</button>
                  <button class="min-h-[44px] px-5 rounded-full border border-gray-300 text-gray-700" onclick={() => $pendingChange?.answer(false)}>{$t('panels.askNo')}</button>
                </div>
              {:else if entry.outcome === 'done'}<p class="mt-1 text-sm text-green-700">{$t('panels.askDone')}</p>
              {:else if entry.outcome === 'failed'}<p class="mt-1 text-sm text-red-700">{$t('panels.askNotDone', { detail: entry.detail ?? '' })}</p>
              {:else}<p class="mt-1 text-sm text-gray-500">{$t('panels.askDeclined')}</p>{/if}
            </div>
          {/if}
        {/each}
        {#if busy && !$pendingChange}<p class="self-start text-sm text-gray-500" role="status">{$t('panels.askThinking')}</p>{/if}
        {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
      </div>
      <form class="flex items-end gap-2 p-2 border-t border-gray-100" onsubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea bind:value={draft} rows="2" aria-label={$t('panels.askTitle')} placeholder={$t('panels.askPlaceholder')}
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          class="flex-1 resize-none rounded-lg border border-gray-300 px-2 py-1.5 text-base outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        {#if busy}
          <button type="button" class="min-h-[44px] px-4 rounded-full border border-gray-300 text-gray-700" onclick={stop}>{$t('panels.askStop')}</button>
        {:else}
          <button type="submit" class="min-h-[44px] px-4 rounded-full bg-blue-600 text-white font-semibold disabled:opacity-40" disabled={!draft.trim()}>{$t('panels.askSend')}</button>
        {/if}
      </form>
    {/if}
  </section>
{/if}
