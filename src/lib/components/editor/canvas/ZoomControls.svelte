<script lang="ts">
  import { t } from '$lib/i18n';
  import { coarsePointer } from '$lib/stores/pointer';

  let { zoom, minimumZoom, bottom, canFitSelection, onzoomout, onreset, onzoomin, onfit, onfitselection }: {
    zoom: number; minimumZoom: number; bottom: number; canFitSelection: boolean;
    onzoomout: () => void; onreset: () => void; onzoomin: () => void; onfit: () => void; onfitselection: () => void } = $props();

  // On a touch screen a tooltip is never seen: each picture has its word under it.
  const finger = 'min-w-[44px] px-1 flex flex-col items-center justify-center rounded hover:bg-gray-100';
</script>

{#snippet picture(symbol: string, word: string)}
  {#if $coarsePointer}
    <span class="leading-none" aria-hidden="true">{symbol}</span><span class="text-xs leading-tight font-normal whitespace-nowrap">{word}</span>
  {:else}{symbol}{/if}
{/snippet}

<!-- Zoom Controls (bottom-left) -->
<!-- On a touch screen the bottom bar spans the width, so the zoom buttons sit above it. With a mouse from 768 px the
     bar's left end can reach under them when the plan is narrow, so they sit just above it there too. -->
<div data-bar="zoom" style:bottom={`${bottom + ($coarsePointer ? 52 : 0)}px`} class="absolute left-3 max-md:left-20 z-20 {$coarsePointer ? '' : 'md:translate-y-[-1.75rem]'} flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5">
  <button
    class="{$coarsePointer ? finger : 'w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100'} text-gray-600 hover:text-gray-800 font-bold text-lg"
    title={$t('canvasZoom.outHint')}
    aria-label={$t('canvasZoom.out')}
    onclick={onzoomout}
  >{@render picture('−', $t('panels.smaller'))}</button>
  <button
    class="min-w-[3.5rem] h-7 flex items-center justify-center rounded hover:bg-gray-100 text-xs font-medium text-gray-600 hover:text-gray-800 tabular-nums"
    title={$t('canvasZoom.resetHint')}
    aria-label={$t('canvasZoom.reset')}
    onclick={onreset}
  >{zoom < 0.01 ? (zoom * 100).toPrecision(2) : Math.round(zoom * 100)}%</button>
  <button
    class="{$coarsePointer ? finger : 'w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100'} text-gray-600 hover:text-gray-800 font-bold text-lg"
    title={$t('canvasZoom.inHint')}
    aria-label={$t('canvasZoom.in')}
    onclick={onzoomin}
  >{@render picture('+', $t('panels.bigger'))}</button>
  <div class="w-px h-5 bg-gray-200"></div>
  <button
    class="{$coarsePointer ? finger : 'w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100'} text-gray-500 hover:text-gray-700 text-sm"
    title={$t('canvasZoom.fitHint')}
    aria-label={$t('canvasZoom.fit')}
    onclick={onfit}
  >{@render picture('⊞', $t('panels.fit'))}</button>
  <button
    class="{$coarsePointer ? finger : 'w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100'} text-gray-500 hover:text-gray-700 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
    title={$t('canvasZoom.selectionHint')}
    aria-label={$t('canvasZoom.selection')}
    disabled={!canFitSelection}
    onclick={onfitselection}
  >{@render picture('⊡', $t('panels.fitThis'))}</button>
</div>
