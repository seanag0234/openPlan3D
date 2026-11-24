<script lang="ts">
  import { tick } from 'svelte';
  import { t, locale } from '$lib/i18n';
  import { furnitureName } from '$lib/i18n/furnitureNames';
  import { noteTarget } from '$lib/stores/ui';
  import { currentProject, detectedRoomsStore, updateItemDetails, updateProjectDescription } from '$lib/stores/project';
  import { itemDetails } from '$lib/utils/itemDetails';
  import { noteTitle } from '$lib/utils/noteMarks';
  import type { DetailTarget } from '$lib/models/types';

  let draft = $state('');
  let error = $state('');
  let box = $state<HTMLTextAreaElement>();
  let portrait = $state(false);
  $effect(() => {
    const upright = matchMedia('(orientation: portrait)');
    const follow = () => { portrait = upright.matches; };
    follow();
    upright.addEventListener('change', follow);
    return () => upright.removeEventListener('change', follow);
  });

  const saved = (target: DetailTarget | 'plan') => {
    const project = $currentProject;
    if (!project) return '';
    return target === 'plan' ? project.description ?? '' : itemDetails(project, target).note ?? '';
  };
  let title = $derived($noteTarget && $currentProject ? noteTitle($currentProject, $noteTarget, $detectedRoomsStore, {
    plan: $t('panels.planNote'), wall: $t('panels.noteWall'), room: $t('roomProperties.heading'),
    piece: id => furnitureName(id, $locale),
  }) : '');

  // Each time the sheet opens it starts from the saved note, with the cursor at its end.
  let opened: DetailTarget | 'plan' | null = null;
  $effect(() => {
    const target = $noteTarget;
    if (target === opened) return;
    opened = target;
    if (!target) return;
    draft = saved(target); error = '';
    // A frame later: a mouse press that opened the sheet would otherwise hand focus back to the plan.
    tick().then(() => requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(draft.length, draft.length); }));
  });

  function write(text: string) {
    const target = $noteTarget;
    if (!target) return;
    try {
      if (target === 'plan') updateProjectDescription(text);
      else if (text !== saved(target)) updateItemDetails(target, { note: text || null });
      noteTarget.set(null);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const done = () => write(draft.trim());
  const remove = () => write('');
</script>

{#if $noteTarget}
  <div class="fixed inset-0 z-[60] bg-black/40 flex {portrait ? 'items-end' : 'items-center justify-center'}"
    onclick={(e) => { if (e.target === e.currentTarget) done(); }} role="presentation">
    <div role="dialog" aria-modal="true" aria-label={title} tabindex="-1"
      class="bg-white shadow-2xl flex flex-col gap-3 p-4 {portrait ? 'w-full rounded-t-2xl' : 'w-full max-w-md mx-4 rounded-2xl'}"
      onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } }}>
      <h2 class="text-base font-semibold text-gray-800 truncate">{title}</h2>
      <textarea bind:this={box} bind:value={draft} rows="5" maxlength="20000" style="font-size:16px"
        aria-label={title} class="w-full px-3 py-2 border border-gray-300 rounded-lg resize-y"></textarea>
      {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
      <div class="flex items-center gap-2">
        <button class="min-h-[44px] px-4 rounded-lg border border-red-200 text-red-700 text-sm active:bg-red-50" onclick={remove}>{$t('panels.removeNote')}</button>
        <button class="ml-auto min-h-[44px] px-6 rounded-lg bg-blue-600 text-white text-sm font-medium active:bg-blue-700" onclick={done}>{$t('panels.done')}</button>
      </div>
    </div>
  </div>
{/if}
