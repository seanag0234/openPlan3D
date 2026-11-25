<script lang="ts">
  import { t } from '$lib/i18n';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  /** Each step names the control it is about by its `data-tour` mark, or none for the plan itself. */
  const steps: { target?: string }[] = [
    {}, {}, {}, { target: 'undo' }, {}, { target: 'things' }, { target: '3d' }, { target: 'notes' }, { target: 'more' }, { target: 'feedback' },
  ];

  let at = $state(0);
  const n = $derived((at + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
  let ring = $state<DOMRect | null>(null);

  $effect(() => { if (open) at = 0; });

  // The marked control can move, appear or hide while she tries the step, so the ring follows it every frame.
  $effect(() => {
    if (!open) return;
    const name = steps[at].target;
    let frame = 0;
    let last: string | null = null;
    const follow = () => {
      const shown = name ? [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find(el => el.getClientRects().length) : undefined;
      const box = shown?.getBoundingClientRect() ?? null;
      const key = box ? `${box.x},${box.y},${box.width},${box.height}` : '';
      if (key !== last) { last = key; ring = box; }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  const go = (to: number) => { at = Math.max(0, Math.min(steps.length - 1, to)); };
</script>

{#if open}
  {#if ring}
    <div
      class="pointer-events-none fixed z-[60] rounded-xl ring-4 ring-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.35)] motion-safe:animate-pulse"
      style="left: {ring.x - 6}px; top: {ring.y - 6}px; width: {ring.width + 12}px; height: {ring.height + 12}px;"
      data-testid="tour-ring"
    ></div>
  {/if}
  <div
    role="dialog" aria-modal="false" aria-label={$t('panels.tour')}
    class="fixed z-[60] top-16 left-1/2 -translate-x-1/2 w-[26rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">{$t('panels.tourStep', { n: at + 1, count: steps.length })}</p>
      <button class="min-w-[44px] min-h-[44px] -m-2 text-gray-400 hover:text-gray-600 text-xl leading-none" onclick={() => open = false} aria-label={$t('panels.tourEnd')}>✕</button>
    </div>
    <div aria-live="polite">
      <h2 class="text-xl font-bold text-slate-800">{$t(`panels.tour${n}Title`)}</h2>
      <p class="mt-2 text-base text-gray-700">{$t(`panels.tour${n}Body`)}</p>
      <p class="mt-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 px-3 py-2 text-base text-slate-700">{$t(`panels.tour${n}Try`)}</p>
    </div>
    <div class="flex items-center gap-2">
      <button class="min-h-[44px] px-4 rounded-full border border-gray-300 text-gray-700 disabled:opacity-40" disabled={at === 0} onclick={() => go(at - 1)}>‹ {$t('panels.tourBack')}</button>
      <div class="flex-1 flex justify-center gap-1.5" aria-hidden="true">
        {#each steps as _, i}<span class="w-2 h-2 rounded-full {i === at ? 'bg-blue-500' : 'bg-gray-300'}"></span>{/each}
      </div>
      {#if at < steps.length - 1}
        <button class="min-h-[44px] px-5 rounded-full bg-blue-600 text-white font-semibold active:bg-blue-700" onclick={() => go(at + 1)}>{$t('panels.tourNext')} ›</button>
      {:else}
        <button class="min-h-[44px] px-5 rounded-full bg-blue-600 text-white font-semibold active:bg-blue-700" onclick={() => open = false}>{$t('panels.done')}</button>
      {/if}
    </div>
  </div>
{/if}
