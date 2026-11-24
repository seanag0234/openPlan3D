<script lang="ts">
  import { t } from '$lib/i18n';

  let { zoom, minimumZoom, bottom, canFitSelection, onzoomout, onreset, onzoomin, onfit, onfitselection }: {
    zoom: number; minimumZoom: number; bottom: number; canFitSelection: boolean;
    onzoomout: () => void; onreset: () => void; onzoomin: () => void; onfit: () => void; onfitselection: () => void } = $props();
</script>

<!-- Zoom Controls (bottom-left) -->
<div style:bottom={`${bottom}px`} class="absolute left-3 max-md:left-20 z-20 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5">
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 font-bold text-lg"
    title={$t('canvasZoom.outHint')}
    aria-label={$t('canvasZoom.out')}
    onclick={onzoomout}
  >−</button>
  <button
    class="min-w-[3.5rem] h-7 flex items-center justify-center rounded hover:bg-gray-100 text-xs font-medium text-gray-600 hover:text-gray-800 tabular-nums"
    title={$t('canvasZoom.resetHint')}
    aria-label={$t('canvasZoom.reset')}
    onclick={onreset}
  >{zoom < 0.01 ? (zoom * 100).toPrecision(2) : Math.round(zoom * 100)}%</button>
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 font-bold text-lg"
    title={$t('canvasZoom.inHint')}
    aria-label={$t('canvasZoom.in')}
    onclick={onzoomin}
  >+</button>
  <div class="w-px h-5 bg-gray-200"></div>
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-sm"
    title={$t('canvasZoom.fitHint')}
    aria-label={$t('canvasZoom.fit')}
    onclick={onfit}
  >⊞</button>
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
    title={$t('canvasZoom.selectionHint')}
    aria-label={$t('canvasZoom.selection')}
    disabled={!canFitSelection}
    onclick={onfitselection}
  >⊡</button>
</div>
