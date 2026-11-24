<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Door } from '$lib/models/types';
  import { duplicateSelection, selectedElementIds, selectedElementId, updateDoor, beginUndoGroup, endUndoGroup, removeElement } from '$lib/stores/project';
  import MoveToFloorMenu from '../MoveToFloorMenu.svelte';
  import { coarsePointer } from '$lib/stores/pointer';
  import { detailsOpen, noteTarget } from '$lib/stores/ui';
  import { handleGeometry } from '$lib/utils/handleGeometry';
  import { toolbarPosition } from '$lib/utils/toolbarPlacement';

  type Extra = { kind: 'measurement' | 'annotation' | 'text'; id: string; x: number; y: number };
  let { anchor, box, selectedId, selectedIds, floorId, locked, extra, onsplit, ondeleteextra }: {
    anchor: { type: string; pos: { x: number; y: number }; door?: Door } | null;
    /** The selection's bounds on screen, in canvas px. */
    box: { left: number; top: number; right: number; bottom: number } | null;
    selectedId: string | null; selectedIds: ReadonlySet<string>; floorId: string; locked: boolean;
    extra: Extra | null; onsplit: () => void; ondeleteextra: (kind: Extra['kind'], id: string) => void } = $props();

  // The bar sits clear of the selection and of a piece's handles, measured from its own size and the plan's.
  let barEl = $state<HTMLDivElement>();
  let barWidth = $state(0), barHeight = $state(0);
  let g = $derived(handleGeometry($coarsePointer));
  let singlePiece = $derived(anchor?.type === 'furniture' && selectedIds.size <= 1);
  let place = $derived.by(() => {
    if (!anchor) return null;
    const parent = barEl?.parentElement;
    if (!box || !barWidth || !parent) return null;
    const clearance = singlePiece ? { above: 18 + 3 * g.outset + g.radius, below: g.outset + g.radius } : { above: 4, below: 4 };
    return toolbarPosition(box, { width: barWidth, height: barHeight }, { width: parent.clientWidth, height: parent.clientHeight }, clearance);
  });
</script>

{#if anchor}
<div data-selection-bar bind:this={barEl} bind:clientWidth={barWidth} bind:clientHeight={barHeight}
  class="absolute z-40 flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 px-1 py-0.5"
  style={place ? `left: ${place.left}px; top: ${place.top}px;` : `left: ${anchor.pos.x}px; top: ${anchor.pos.y - 44}px; transform: translateX(-50%);`}
>
  {#if $coarsePointer}
    <button class="h-7 px-2 text-xs rounded hover:bg-gray-100 text-gray-700" onclick={() => detailsOpen.set(true)}>{$t('panels.details')}</button>
  {/if}
  {#if selectedId && selectedIds.size <= 1 && (anchor.type === 'furniture' || anchor.type === 'wall')}
    <button
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
      title={$t('panels.note')}
      aria-label={$t('panels.note')}
      onclick={() => { if (selectedId) noteTarget.set({ floorId, kind: anchor.type === 'wall' ? 'walls' : 'furniture', id: selectedId }); }}
    ><span aria-hidden="true">📝</span></button>
  {/if}
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
    title={$t('contextMenu.duplicate')}
    aria-label={$t('contextMenu.duplicate')}
    onclick={() => {
      if (!selectedId) return;
      const ids = selectedIds.size ? selectedIds : new Set([selectedId]);
      const newIds = duplicateSelection(ids);
      if (newIds.length) {
        selectedElementIds.set(new Set(newIds));
        selectedElementId.set(newIds[0]);
      }
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
  </button>
  {#if anchor.type === 'door' && anchor.door}
    <button
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
      title={$t('canvasActions.flipSwing')}
      aria-label={$t('canvasActions.flipSwing')}
      onclick={() => { if (anchor.door) updateDoor(anchor.door.id, { swingDirection: anchor.door.swingDirection === 'left' ? 'right' : 'left' }); }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
    </button>
  {/if}
  {#if anchor.type === 'wall' && selectedId && selectedIds.size === 0}
    <button
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
      title={$t('canvasActions.splitMidpoint')}
      aria-label={$t('canvasActions.splitMidpoint')}
      onclick={onsplit}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M4 12h4M16 12h4"/></svg>
    </button>
  {/if}
  {#if selectedId && selectedIds.size === 0}
    <MoveToFloorMenu ids={new Set([selectedId])} />
  {/if}
  {#if !locked}
  <div class="w-px h-5 bg-gray-200 mx-0.5"></div>
  <button
    class="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
    title={$t('contextMenu.delete')}
    aria-label={$t('contextMenu.delete')}
    onclick={() => {
      if (selectedIds.size > 0) {
        beginUndoGroup();
        for (const id of selectedIds) removeElement(id);
        endUndoGroup();
        selectedElementIds.set(new Set());
        selectedElementId.set(null);
      } else if (selectedId) {
        removeElement(selectedId);
        selectedElementId.set(null);
      }
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
  </button>
  {/if}
</div>
{/if}
