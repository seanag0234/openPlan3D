<script lang="ts">
  import { t } from '$lib/i18n';

  let { wallStarted, placingRotation, measuring, textMode, annotating, annotationStarted, ondone }: {
    wallStarted: boolean; placingRotation: number | null; measuring: boolean; textMode: boolean;
    annotating: boolean; annotationStarted: boolean; ondone: () => void } = $props();
</script>

{#if wallStarted}
  <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs shadow">
    {$t('canvasHints.wall')}
  </div>
{/if}
{#if placingRotation !== null}
  <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-3 py-1 rounded-full text-xs shadow">
    {$t('canvasHints.furniture', { angle: placingRotation })}
  </div>
{/if}
{#if measuring}
  <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white px-3 py-1 rounded-full text-xs shadow">
    {$t('canvasHints.measure')}
  </div>
{/if}
{#if textMode}
  <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-3 py-1 rounded-full text-xs shadow">
    {$t('canvasHints.text')}
  </div>
{/if}
{#if annotating}
  <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs shadow">
    {$t(annotationStarted ? 'canvasHints.annotateEnd' : 'canvasHints.annotateStart')}
  </div>
{/if}
