<script lang="ts">
  import { t } from '$lib/i18n';
  import { getActiveTip, dismissTip, setTipsOn, TIPS } from '$lib/stores/onboarding.svelte';
  import { coarsePointer } from '$lib/stores/pointer';

  /** `paused` while the guided tour is up, so the two never talk over each other. */
  let { paused = false }: { paused?: boolean } = $props();
  let tip = $derived(paused ? null : getActiveTip());
  let visible = $state(false);
  let viewportWidth = $state(1200);
  let viewportHeight = $state(800);
  let tipWidth = $state(280);
  let tipHeight = $state(0);
  const margin = 8;

  // Beside a touch it sits a finger's width below it, or above when there is no room below.
  const finger = 44;
  let wantX = $derived(tip?.near ? tip.near.x - tipWidth / 2 : tip?.x ?? margin);
  let wantY = $derived(!tip ? margin : !tip.near ? tip.y
    : tip.near.y + finger + tipHeight <= viewportHeight - margin ? tip.near.y + finger : tip.near.y - finger - tipHeight);
  let left = $derived(tip ? Math.max(margin, Math.min(wantX, viewportWidth - tipWidth - margin)) : margin);
  let top = $derived(tip ? Math.max(margin, Math.min(wantY, viewportHeight - tipHeight - margin)) : margin);

  $effect(() => {
    visible = false;
    if (tip) {
      const frame = requestAnimationFrame(() => { visible = true; });
      const timer = setTimeout(dismissTip, 8000);
      // Resizing only changes placement; it must not restart the dismissal timer.
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }
  });
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />

{#if tip}
  <div
    role="region"
    aria-label={$t('onboarding.title')}
    bind:offsetWidth={tipWidth}
    bind:offsetHeight={tipHeight}
    class="fixed z-[9999] pointer-events-none flex flex-col gap-2 bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 text-sm leading-relaxed transition-opacity duration-300 ease-out"
    class:opacity-0={!visible}
    class:opacity-100={visible}
    style="left:{left}px;top:{top}px;width:{Math.max(0, Math.min(280, viewportWidth - margin * 2))}px;max-height:{Math.max(0, viewportHeight - margin * 2)}px;"
  >
    <p class="min-h-0 overflow-y-auto">{#if TIPS[tip.id] === 'new'}<span class="mr-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-950">{$t('onboarding.new')}</span>{/if}{$t(`onboarding.${tip.id}`)}</p>
    <div class="shrink-0 flex flex-wrap items-center gap-2">
      <button
        class="pointer-events-auto text-xs font-medium px-3 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 transition-colors {$coarsePointer ? 'min-h-[44px] px-4' : ''}"
        onclick={dismissTip}
      >{$t('onboarding.dismiss')}</button>
      {#if TIPS[tip.id] === 'guide'}
        <button
          class="pointer-events-auto text-xs px-3 py-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors {$coarsePointer ? 'min-h-[44px] px-4' : ''}"
          onclick={() => setTipsOn(false)}
        >{$t('onboarding.turnOff')}</button>
      {/if}
    </div>
  </div>
{/if}
