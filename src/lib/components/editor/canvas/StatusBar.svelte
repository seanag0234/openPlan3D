<script lang="ts">
  import { t } from '$lib/i18n';
  import { formatArea, projectSettings } from '$lib/stores/settings';
  import { houseFixed, layerVisibility, setHouseFixed } from '$lib/stores/project';
  import { coarsePointer } from '$lib/stores/pointer';
  import type { Floor, Room } from '$lib/models/types';
  import type { SnapStatus } from '$lib/utils/snapStep';

  let { rooms, floor, floorBelow, selectedCount, zoom, snapControl, snapEnabled, layerVis, showRoomLabels, showDimensions, bottomInset,
        showGrid = $bindable(), showRulers = $bindable(), showMinimap = $bindable(), onfit }: {
    rooms: Room[]; floor: Floor | null; floorBelow: Floor | null; selectedCount: number; zoom: number;
    snapControl: SnapStatus; snapEnabled: boolean; layerVis: Record<string, boolean>; showRoomLabels: boolean; showDimensions: boolean;
    bottomInset: number; showGrid: boolean; showRulers: boolean; showMinimap: boolean; onfit: () => void } = $props();

  let showLayerPanel = $state(false);
  const mouseBarClass = 'absolute bottom-2 right-2 max-md:bottom-[calc(var(--visible-bottom)+3rem)] max-md:left-2 max-md:overflow-x-auto max-md:min-h-12 max-md:items-center max-md:whitespace-nowrap max-md:[&>*]:shrink-0 bg-white/80 rounded px-2 py-1 text-xs text-gray-500 flex gap-3';
  // On a touch screen the row is one line across the bottom that scrolls sideways; the counts and view toggles leave it.
  /** The kinds of thing on the plan that can be hidden from the popup; when any is, a notice says so. */
  const HIDEABLE = ['walls', 'doors', 'windows', 'furniture', 'stairs', 'columns', 'measurements', 'annotations', 'textAnnotations'] as const;
  const somethingHidden = $derived(HIDEABLE.some(key => layerVis[key] === false));
  function showAll() {
    layerVisibility.update(v => ({ ...v, ...Object.fromEntries(HIDEABLE.map(key => [key, true])) }));
  }
  const touchBarClass = 'absolute bottom-2 left-2 right-2 bg-white/80 rounded px-2 py-1 text-xs text-gray-500 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap [&>*]:shrink-0';
</script>

<!-- Keep controls above classic horizontal scrollbars, which consume height on Linux. -->
<div data-bar="bottom" style:--visible-bottom={`${bottomInset}px`} class={$coarsePointer ? touchBarClass : mouseBarClass}>
  <!-- Whether walls, doors, windows and rooms ignore presses; another lane's message quotes "House: fixed". -->
  <button class="font-medium {$houseFixed ? 'text-emerald-700' : 'hover:text-gray-700'}" aria-pressed={$houseFixed} title={$t('bars.houseHint')} onclick={() => setHouseFixed(!$houseFixed)}>
    {$houseFixed ? $t('bars.houseFixed') : $t('bars.houseMoves')}
  </button>
  {#if !$coarsePointer}
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
  {/if}
  <span>{$t('canvasStatus.zoom', { value: Math.round(zoom * 100) })}</span>
  <button class="hover:text-gray-700" onclick={onfit} title={$t('canvasZoom.fitHint')}>⊞ {$t('canvasDisplay.fit')}</button>
  {#if !$coarsePointer}
  <button class="hover:text-gray-700" onclick={() => showGrid = !showGrid} title={$t('canvasDisplay.gridHint')} aria-pressed={showGrid}>
    {showGrid ? '▦' : '▢'} {$t('canvasDisplay.grid')}
  </button>
  {/if}
  <!-- Snap (S) picks the step snapping rounds to and shows it; the top-bar Snap to Grid turns snapping off, and then this reads "Snap off". -->
  <button class="hover:text-gray-700" onclick={() => projectSettings.update(s => ({ ...s, snapToGrid: !s.snapToGrid }))} title={snapControl.title} aria-pressed={snapControl.pressed}>
    <span class:opacity-40={!snapEnabled}>🧲</span> {snapControl.label}
  </button>
  {#if !$coarsePointer}
  <button class="hover:text-gray-700" onclick={() => layerVisibility.update(v => ({ ...v, furniture: !v.furniture }))} title={$t('canvasDisplay.furnitureHint')} aria-pressed={layerVis.furniture}>
    {layerVis.furniture ? '🪑' : '👻'} {$t('canvasDisplay.furniture')}
  </button>
  {/if}
  <!-- "Layers" names only the list of everything on the plan; this popup shows and hides kinds of thing. -->
  <button class="hover:text-gray-700" onclick={() => showLayerPanel = !showLayerPanel} title={$t('layerVisibility.title')}>
    🗂 {$t('bars.showHide')}
  </button>
  {#if !$coarsePointer}
  <button class="hover:text-gray-700" onclick={() => showRulers = !showRulers} title={$t('canvasDisplay.rulersHint')} aria-pressed={showRulers}>
    {showRulers ? '📏' : '📐'} {$t('canvasDisplay.rulers')}
  </button>
  <button class="hover:text-gray-700" onclick={() => showMinimap = !showMinimap} title={$t('canvasDisplay.mapHint')} aria-pressed={showMinimap}>
    {showMinimap ? '🗺' : '🗺'} {$t('canvasDisplay.map')}
  </button>
  {/if}
</div>
<!-- Hidden things leave the plan without a word otherwise. -->
{#if somethingHidden}
  <!-- Centred above the bar, clear of the zoom buttons at the left and the map at the right. -->
  <div role="status" style:--visible-bottom={`${bottomInset}px`} class="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-amber-100 border border-amber-300 pl-3 pr-1 py-0.5 text-amber-900 shadow whitespace-nowrap {$coarsePointer
    ? 'bottom-16 text-sm'
    : 'bottom-10 max-md:bottom-[calc(var(--visible-bottom)+5.5rem)] text-xs'}">
    <span>{$t('bars.someHidden')}</span>
    <button class="rounded-full bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-50" onclick={showAll}>{$t('bars.showAll')}</button>
  </div>
{/if}
<!-- Layer Visibility Panel -->
{#if showLayerPanel}
  <div style:--visible-bottom={`${bottomInset}px`} class={$coarsePointer
    ? 'absolute bottom-16 right-2 max-h-[calc(100%-5rem)] overflow-y-auto z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-sm min-w-[200px]'
    : 'absolute bottom-12 right-2 max-md:bottom-[calc(var(--visible-bottom)+6rem)] z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs min-w-[160px]'}>
    <div class="font-semibold text-gray-700 mb-2">{$t('bars.showHide')}</div>
    {#if $coarsePointer}
      <!-- The bar's Grid, Rulers and Map buttons, as tick boxes, on a touch screen. -->
      <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
        <input type="checkbox" bind:checked={showGrid} class="accent-blue-500" />
        <span>{$t('canvasDisplay.grid')}</span>
      </label>
      <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
        <input type="checkbox" bind:checked={showRulers} class="accent-blue-500" />
        <span>{$t('canvasDisplay.rulers')}</span>
      </label>
      <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
        <input type="checkbox" bind:checked={showMinimap} class="accent-blue-500" />
        <span>{$t('canvasDisplay.map')}</span>
      </label>
      <hr class="my-1 border-gray-100" />
    {/if}
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
