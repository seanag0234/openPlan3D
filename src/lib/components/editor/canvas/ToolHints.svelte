<script lang="ts">
  import { t } from '$lib/i18n';
  import { coarsePointer } from '$lib/stores/pointer';

  let { wallStarted, placingRotation, measuring, textMode, annotating, annotationStarted, ondone }: {
    wallStarted: boolean; placingRotation: number | null; measuring: boolean; textMode: boolean;
    annotating: boolean; annotationStarted: boolean; ondone: () => void } = $props();
</script>

<!-- Each message carries Done, so leaving a tool never needs the Escape key; on a touch screen it speaks of taps. -->
{#snippet pill(colour: string, text: string, done: () => void)}
  <div data-tool-hint class="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 {colour} text-white pl-3 pr-1 py-0.5 rounded-full shadow max-w-[calc(100%-1rem)] {$coarsePointer ? 'text-sm' : 'text-xs'}">
    <span class="min-w-0">{text}</span>
    <button class="shrink-0 rounded-full bg-white/90 px-2.5 py-0.5 font-semibold text-slate-800 hover:bg-white" onclick={done}>{$t('bars.done')}</button>
  </div>
{/snippet}

{#if wallStarted}
  {@render pill('bg-blue-600', $coarsePointer ? $t('bars.hintWall') : $t('canvasHints.wall'), ondone)}
{/if}
{#if placingRotation !== null}
  {@render pill('bg-purple-600', $coarsePointer ? $t('bars.hintPlace') : $t('canvasHints.furniture', { angle: placingRotation }), ondone)}
{/if}
{#if measuring}
  {@render pill('bg-red-600', $coarsePointer ? $t('bars.hintMeasure') : $t('canvasHints.measure'), ondone)}
{/if}
{#if textMode}
  {@render pill('bg-emerald-600', $coarsePointer ? $t('bars.hintText') : $t('canvasHints.text'), ondone)}
{/if}
{#if annotating}
  {@render pill('bg-indigo-600', $coarsePointer
    ? $t(annotationStarted ? 'bars.hintDimensionEnd' : 'bars.hintDimensionStart')
    : $t(annotationStarted ? 'canvasHints.annotateEnd' : 'canvasHints.annotateStart'), ondone)}
{/if}
