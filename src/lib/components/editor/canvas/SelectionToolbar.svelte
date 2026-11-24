<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { furnitureName, customModelName } from '$lib/i18n/furnitureNames';
  import type { Door } from '$lib/models/types';
  import { currentProject, duplicateSelection, selectedElementIds, selectedElementId, updateDoor, beginUndoGroup, endUndoGroup, removeElement, toggleSelectionLock } from '$lib/stores/project';
  import MoveToFloorMenu from '../MoveToFloorMenu.svelte';
  import { coarsePointer } from '$lib/stores/pointer';
  import { detailsOpen, multiSelectMode, noteTarget } from '$lib/stores/ui';
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
  let floor = $derived($currentProject?.floors.find(f => f.id === floorId) ?? null);
  let place = $derived.by(() => {
    const parent = barEl?.parentElement;
    if (!anchor) {
      // A selected measuring line, dimension or text label: above the point the plan gives.
      if (!extra || !barWidth || !parent) return null;
      return toolbarPosition({ left: extra.x, top: extra.y, right: extra.x, bottom: extra.y }, { width: barWidth, height: barHeight },
        { width: parent.clientWidth, height: parent.clientHeight }, { above: 12, below: 12 });
    }
    if (!box || !barWidth || !parent) return null;
    const clearance = singlePiece ? { above: 18 + 3 * g.outset + g.radius, below: g.outset + g.radius } : { above: 4, below: 4 };
    // A wall that bows upward has its curve handle just above it: the bar goes under it, so the handle stays free to drag.
    const wall = anchor.type === 'wall' ? floor?.walls.find(w => w.id === selectedId) : undefined;
    const prefer = wall?.curvePoint && wall.curvePoint.y < (wall.start.y + wall.end.y) / 2 ? 'below' : 'above';
    return toolbarPosition(box, { width: barWidth, height: barHeight }, { width: parent.clientWidth, height: parent.clientHeight }, clearance, 8, prefer);
  });

  const coarse = $derived($coarsePointer);
  /** The ids the bar acts on: the whole selection, or the one thing selected. */
  const ids = () => selectedIds.size ? selectedIds : new Set(selectedId ? [selectedId] : []);
  let single = $derived(!!selectedId && selectedIds.size <= 1);
  let otherFloors = $derived(($currentProject?.floors.length ?? 0) > 1);
  // On a touch screen the bar starts with what is selected.
  let name = $derived.by(() => {
    if (selectedIds.size > 1) return $t('panels.several', { count: selectedIds.size });
    if (!anchor || !selectedId) return '';
    if (anchor.type === 'furniture') {
      const piece = floor?.furniture.find(item => item.id === selectedId);
      return piece ? customModelName(piece, $currentProject) ?? furnitureName(piece.catalogId, $locale) : '';
    }
    if (anchor.type === 'wall') return $t('panels.noteWall');
    if (anchor.type === 'door') return $t('openingProperties.door');
    if (anchor.type === 'window') return $t('openingProperties.window');
    return '';
  });

  function duplicate() {
    if (!selectedId) return;
    const newIds = duplicateSelection(ids());
    if (newIds.length) {
      selectedElementIds.set(new Set(newIds));
      selectedElementId.set(newIds[0]);
    }
  }
  function remove() {
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
  }
  const mouseButton = 'w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700';
  const fingerButton = 'min-w-[44px] min-h-[44px] px-1.5 flex flex-col items-center justify-center gap-0.5 rounded-lg text-gray-700 active:bg-gray-100';
</script>

{#snippet icon(path: string)}
  <svg width={coarse ? 18 : 14} height={coarse ? 18 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">{@html path}</svg>
{/snippet}
{#snippet word(text: string)}
  {#if coarse}<span class="text-[11px] leading-tight whitespace-nowrap">{text}</span>{/if}
{/snippet}

{#if anchor}
<div data-selection-bar bind:this={barEl} bind:clientWidth={barWidth} bind:clientHeight={barHeight}
  class="absolute z-40 flex items-center bg-white rounded-lg shadow-lg border border-gray-200 {coarse ? 'gap-1 px-1.5 py-1' : 'gap-0.5 px-1 py-0.5'}"
  style={place ? `left: ${place.left}px; top: ${place.top}px;` : `left: ${anchor.pos.x}px; top: ${anchor.pos.y - 44}px; transform: translateX(-50%);`}
>
  {#if coarse && name}
    <span class="max-w-[10rem] truncate px-1.5 text-sm font-semibold text-gray-800">{name}</span>
    <div class="w-px h-8 bg-gray-200"></div>
  {/if}
  {#if coarse}
    <button class={fingerButton} onclick={() => detailsOpen.set(true)}>
      {@render icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')}{@render word($t('panels.details'))}
    </button>
  {/if}
  {#if single && (anchor.type === 'furniture' || anchor.type === 'wall')}
    <button class={coarse ? fingerButton : mouseButton}
      title={coarse ? undefined : $t('panels.note')} aria-label={coarse ? undefined : $t('panels.note')}
      onclick={() => { if (selectedId) noteTarget.set({ floorId, kind: anchor.type === 'wall' ? 'walls' : 'furniture', id: selectedId }); }}
    ><span class={coarse ? 'text-base leading-none' : ''} aria-hidden="true">📝</span>{@render word($t('panels.note'))}</button>
  {/if}
  <button class={coarse ? fingerButton : mouseButton}
    title={coarse ? undefined : $t('contextMenu.duplicate')} aria-label={coarse ? undefined : $t('contextMenu.duplicate')}
    onclick={duplicate}
  >{@render icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>')}{@render word($t('panels.copy'))}</button>
  {#if coarse}
    <button class="{fingerButton} {$multiSelectMode ? 'bg-blue-100 text-blue-800' : ''}" aria-pressed={$multiSelectMode}
      onclick={() => multiSelectMode.update(on => !on)}
    >{@render icon('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M17 4v6M14 7h6"/>')}{@render word($t('panels.selectMore'))}</button>
  {/if}
  {#if anchor.type === 'door' && anchor.door}
    <button class={coarse ? fingerButton : mouseButton}
      title={coarse ? undefined : $t('canvasActions.flipSwing')} aria-label={coarse ? undefined : $t('canvasActions.flipSwing')}
      onclick={() => { if (anchor.door) updateDoor(anchor.door.id, { swingDirection: anchor.door.swingDirection === 'left' ? 'right' : 'left' }); }}
    >{@render icon('<path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>')}{@render word($t('panels.flip'))}</button>
  {/if}
  {#if anchor.type === 'wall' && selectedId && selectedIds.size === 0}
    <button class={coarse ? fingerButton : mouseButton}
      title={coarse ? undefined : $t('canvasActions.splitMidpoint')} aria-label={coarse ? undefined : $t('canvasActions.splitMidpoint')}
      onclick={onsplit}
    >{@render icon('<path d="M12 2v20M4 12h4M16 12h4"/>')}{@render word($t('panels.split'))}</button>
  {/if}
  {#if selectedId && selectedIds.size === 0}
    {#if coarse && otherFloors}
      <!-- The menu's own button is sized from here; its word sits beside it. -->
      <div class="flex flex-col items-center justify-center min-h-[44px] [&_button[aria-haspopup]]:min-w-[44px] [&_button[aria-haspopup]]:min-h-[32px] [&_button[aria-haspopup]]:justify-center">
        <MoveToFloorMenu ids={new Set([selectedId])} />
        {@render word($t('panels.move'))}
      </div>
    {:else}
      <MoveToFloorMenu ids={new Set([selectedId])} />
    {/if}
  {/if}
  {#if !locked}
    <div class="w-px {coarse ? 'h-8' : 'h-5'} bg-gray-200 mx-0.5"></div>
    <button class={coarse ? `${fingerButton} text-red-700` : 'w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-600'}
      title={coarse ? undefined : $t('contextMenu.delete')} aria-label={coarse ? undefined : $t('contextMenu.delete')}
      onclick={remove}
    >{@render icon('<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/>')}{@render word($t('contextMenu.delete'))}</button>
  {:else if coarse}
    <div class="w-px h-8 bg-gray-200 mx-0.5"></div>
    <button class="{fingerButton} text-amber-800" onclick={() => toggleSelectionLock(ids())}>
      {@render icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>')}{@render word($t('panels.unlock'))}
    </button>
  {/if}
</div>
{:else if extra}
<div data-selection-bar data-extra-kind={extra.kind} bind:this={barEl} bind:clientWidth={barWidth} bind:clientHeight={barHeight}
  class="absolute z-40 flex items-center bg-white rounded-lg shadow-lg border border-gray-200 {coarse ? 'gap-1 px-1.5 py-1' : 'gap-0.5 px-1 py-0.5'}"
  style={place ? `left: ${place.left}px; top: ${place.top}px;` : `left: ${extra.x}px; top: ${extra.y - 44}px; transform: translateX(-50%);`}
>
  {#if extra.kind === 'text'}
    <button class={coarse ? fingerButton : mouseButton}
      title={coarse ? undefined : $t('panels.details')} aria-label={coarse ? undefined : $t('panels.details')}
      onclick={() => detailsOpen.set(true)}
    >{@render icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')}{@render word($t('panels.details'))}</button>
  {/if}
  <button class={coarse ? `${fingerButton} text-red-700` : 'w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-600'}
    title={coarse ? undefined : $t('contextMenu.delete')} aria-label={coarse ? undefined : $t('contextMenu.delete')}
    onclick={() => { if (extra) ondeleteextra(extra.kind, extra.id); }}
  >{@render icon('<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/>')}{@render word($t('contextMenu.delete'))}</button>
</div>
{/if}
