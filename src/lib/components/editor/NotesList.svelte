<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { furnitureName } from '$lib/i18n/furnitureNames';
  import { coarsePointer } from '$lib/stores/pointer';
  import { noteTarget, notesListOpen, revealSelection } from '$lib/stores/ui';
  import { activeFloor, currentProject, detectedRoomsStore, selectedElementId, selectedElementIds, selectedRoomId } from '$lib/stores/project';
  import { itemDetails } from '$lib/utils/itemDetails';
  import { noteMarkList, noteTitle } from '$lib/utils/noteMarks';
  import type { CanvasState } from '$lib/utils/canvasInteraction';
  import type { DetailTarget } from '$lib/models/types';

  // Where the marks sit does not matter here, only which things carry a note.
  const anywhere = { ctx: null, width: 0, height: 0, zoom: 1, camX: 0, camY: 0 } as unknown as CanvasState;
  let noted = $derived($currentProject && $activeFloor
    ? noteMarkList(anywhere, $currentProject, $activeFloor, $detectedRoomsStore, null).map(mark => mark.target) : []);
  let planNote = $derived(($currentProject?.description ?? '').trim());
  const firstLine = (text: string) => text.trim().split('\n')[0];
  const words = $derived({ plan: $t('panels.planNote'), wall: $t('panels.noteWall'), room: $t('roomProperties.heading'), piece: (id: string) => furnitureName(id, $locale) });
  let rows = $derived($currentProject ? noted.map(target => ({
    target, name: noteTitle($currentProject!, target, $detectedRoomsStore, words), line: firstLine(itemDetails($currentProject!, target).note ?? ''),
  })) : []);

  function open(target: DetailTarget | 'plan') {
    notesListOpen.set(false);
    if (target !== 'plan') {
      selectedElementIds.set(new Set());
      if (target.kind === 'rooms') { selectedElementId.set(null); selectedRoomId.set(target.id); }
      else { selectedRoomId.set(null); selectedElementId.set(target.id); }
      revealSelection.update(n => n + 1);
    }
    noteTarget.set(target);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && $notesListOpen) notesListOpen.set(false); }} />

<button
  class="pointer-events-auto relative w-8 h-8 rounded-full shadow-lg transition-colors text-sm {$notesListOpen ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-100 hover:bg-slate-600'}"
  aria-label={$t('panels.notes')} title={$t('panels.notes')} aria-expanded={$notesListOpen}
  data-note-marks={noted.length}
  onclick={() => notesListOpen.update(open => !open)}
>📝{#if noted.length + (planNote ? 1 : 0)}<span class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-[10px] leading-4 font-bold text-amber-950">{noted.length + (planNote ? 1 : 0)}</span>{/if}</button>

{#if $notesListOpen}
  <div class="pointer-events-auto fixed bottom-16 {$coarsePointer ? 'left-14' : 'left-4'} z-50 w-80 max-w-[calc(100vw-5rem)] max-h-[60vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 p-2">
    <h2 class="px-2 pt-1 pb-2 text-sm font-semibold text-gray-800">{$t('panels.notes')}</h2>
    <ul aria-label={$t('panels.notes')} class="flex flex-col gap-1">
      <li>
        <button class="w-full min-h-[44px] text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-100" onclick={() => open('plan')}>
          <span class="block text-sm font-medium text-gray-800">{$t('panels.planNote')}</span>
          <span class="block text-xs truncate {planNote ? 'text-gray-600' : 'text-blue-700'}">{planNote ? firstLine(planNote) : $t('panels.addPlanNote')}</span>
        </button>
      </li>
      {#each rows as row (`${row.target.kind}:${row.target.id}`)}
        <li>
          <button class="w-full min-h-[44px] text-left px-2 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-100" onclick={() => open(row.target)}>
            <span class="block text-sm font-medium text-gray-800 truncate">{row.name}</span>
            <span class="block text-xs text-gray-600 truncate">{row.line}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}
