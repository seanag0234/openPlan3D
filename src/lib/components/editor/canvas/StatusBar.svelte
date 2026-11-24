<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatArea, projectSettings } from '$lib/stores/settings';
  import { layerVisibility } from '$lib/stores/project';
  import type { Floor, Room } from '$lib/models/types';
  import type { SnapStatus } from '$lib/utils/snapStep';

  let { rooms, floor, floorBelow, selectedCount, zoom, snapControl, snapEnabled, layerVis, showRoomLabels, showDimensions, bottomInset,
        showGrid = $bindable(), showRulers = $bindable(), showMinimap = $bindable(), onfit }: {
    rooms: Room[]; floor: Floor | null; floorBelow: Floor | null; selectedCount: number; zoom: number;
    snapControl: SnapStatus; snapEnabled: boolean; layerVis: Record<string, boolean>; showRoomLabels: boolean; showDimensions: boolean;
    bottomInset: number; showGrid: boolean; showRulers: boolean; showMinimap: boolean; onfit: () => void } = $props();

  let showLayerPanel = $state(false);
</script>

<!-- Keep controls above classic horizontal scrollbars, which consume height on Linux. -->
<div data-bar="bottom" style:--visible-bottom={`${bottomInset}px`} class="absolute bottom-2 right-2 max-md:bottom-[calc(var(--visible-bottom)+3rem)] max-md:left-2 max-md:overflow-x-auto max-md:min-h-12 max-md:items-center max-md:whitespace-nowrap max-md:[&>*]:shrink-0 bg-white/80 rounded px-2 py-1 text-xs text-gray-500 flex gap-3">
  {#if rooms.length > 0}
    <span>{$t(rooms.length === 1 ? 'canvasStatus.roomsOne' : 'canvasStatus.roomsMany', { count: rooms.length })}</span>
    <span>{formatArea(rooms.reduce((s, r) => s + r.area, 0), $projectSettings.units)}</span>
    <span class="text-gray-300">|</span>
  {/if}
  {#if floor}
    <span>{$t(floor.walls.length === 1 ? 'canvasStatus.wallsOne' : 'canvasStatus.wallsMany', { count: floor.walls.length })}</span>
    {#if floor.doors.length > 0}
      <span>{$t(floor.doors.length === 1 ? 'canvasStatus.doorsOne' : 'canvasStatus.doorsMany', { count: floor.doors.length })}</span>
    {/if}
    {#if floor.windows.length > 0}
      <span>{$t(floor.windows.length === 1 ? 'canvasStatus.windowsOne' : 'canvasStatus.windowsMany', { count: floor.windows.length })}</span>
    {/if}
    {#if floor.furniture.length > 0}
      <span>{$t(floor.furniture.length === 1 ? 'canvasStatus.objectsOne' : 'canvasStatus.objectsMany', { count: floor.furniture.length })}</span>
    {/if}
    <span class="text-gray-300">|</span>
  {/if}
  {#if selectedCount > 1}
    <span class="text-blue-600 font-medium">{$t('canvasStatus.selected', { count: selectedCount })}</span>
    <span class="text-gray-300">|</span>
  {/if}
  <span>{$t('canvasStatus.zoom', { value: Math.round(zoom * 100) })}</span>
  <button class="hover:text-gray-700" onclick={onfit} title={$t('canvasZoom.fitHint')}>⊞ {$t('canvasDisplay.fit')}</button>
  <button class="hover:text-gray-700" onclick={() => showGrid = !showGrid} title={$t('canvasDisplay.gridHint')} aria-pressed={showGrid}>
    {showGrid ? '▦' : '▢'} {$t('canvasDisplay.grid')}
  </button>
  <!-- Snap (S) picks the step snapping rounds to and shows it; the top-bar Snap to Grid turns snapping off, and then this reads "Snap off". -->
  <button class="hover:text-gray-700" onclick={() => projectSettings.update(s => ({ ...s, snapToGrid: !s.snapToGrid }))} title={snapControl.title} aria-pressed={snapControl.pressed}>
    <span class:opacity-40={!snapEnabled}>🧲</span> {snapControl.label}
  </button>
  <button class="hover:text-gray-700" onclick={() => layerVisibility.update(v => ({ ...v, furniture: !v.furniture }))} title={$t('canvasDisplay.furnitureHint')} aria-pressed={layerVis.furniture}>
    {layerVis.furniture ? '🪑' : '👻'} {$t('canvasDisplay.furniture')}
  </button>
  <button class="hover:text-gray-700" onclick={() => showLayerPanel = !showLayerPanel} title={$t('layerVisibility.title')}>
    🗂 {$t('layers.title')}
  </button>
  <button class="hover:text-gray-700" onclick={() => showRulers = !showRulers} title={$t('canvasDisplay.rulersHint')} aria-pressed={showRulers}>
    {showRulers ? '📏' : '📐'} {$t('canvasDisplay.rulers')}
  </button>
  <button class="hover:text-gray-700" onclick={() => showMinimap = !showMinimap} title={$t('canvasDisplay.mapHint')} aria-pressed={showMinimap}>
    {showMinimap ? '🗺' : '🗺'} {$t('canvasDisplay.map')}
  </button>
</div>
<!-- Layer Visibility Panel -->
{#if showLayerPanel}
  <div style:--visible-bottom={`${bottomInset}px`} class="absolute bottom-12 right-2 max-md:bottom-[calc(var(--visible-bottom)+6rem)] z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs min-w-[160px]">
    <div class="font-semibold text-gray-700 mb-2">{$t('layers.title')}</div>
    {#each [['walls',$t('layers.walls')],['doors',$t('layers.doors')],['windows',$t('layers.windows')],['furniture',$t('layers.furniture')],['stairs',$t('layers.stairs')],['columns',$t('layers.columns')],['guides',$t('layers.guides')],['measurements',$t('layers.measurements')],['annotations',$t('layerVisibility.dimensions')],['textAnnotations',$t('layers.textAnnotations')]] as [key, label]}
      <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
        <input type="checkbox" checked={layerVis[key]} onchange={() => layerVisibility.update(v => ({ ...v, [key]: !(v as Record<string, boolean>)[key] }))} class="accent-blue-500" />
        <span>{label}</span>
      </label>
    {/each}
    <hr class="my-1 border-gray-100" />
    <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1" class:opacity-40={!floorBelow}>
      <input type="checkbox" checked={layerVis.floorBelow} disabled={!floorBelow} onchange={() => layerVisibility.update(v => ({ ...v, floorBelow: !v.floorBelow }))} class="accent-blue-500" />
      <span>{floorBelow ? $t('layerVisibility.belowNamed', { name: floorBelow.name }) : $t('layerVisibility.below')}</span>
    </label>
    <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
      <input type="checkbox" checked={showRoomLabels} onchange={() => layerVisibility.update(v => ({ ...v, roomLabels: !v.roomLabels }))} class="accent-blue-500" />
      <span>{$t('layerVisibility.roomLabels')}</span>
    </label>
    <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
      <input type="checkbox" checked={showDimensions} onchange={() => projectSettings.update(s => ({ ...s, showDimensions: !s.showDimensions }))} class="accent-blue-500" />
      <span>{$t('layerVisibility.automaticDimensions')}</span>
    </label>
  </div>
{/if}
