<script lang="ts">
  import { t } from '$lib/i18n';
  import { importQuestion, type ImportAnswer } from '$lib/stores/ui';
  import { modalDialog } from '$lib/utils/modalDialog';

  const id = $props.id();
  const choices = [
    { answer: 'replace', label: 'home.haveReplace', help: 'home.haveReplaceHelp' },
    { answer: 'copy', label: 'home.haveBoth', help: 'home.haveBothHelp' },
    { answer: 'cancel', label: 'home.haveCancel', help: 'home.haveCancelHelp' },
  ] as const;

  /** Answer once: the opening waiting on it clears the question. */
  function answer(choice: ImportAnswer) { $importQuestion?.resolve(choice); }
</script>

{#if $importQuestion}
  <!-- Escape and a press outside the card are Cancel. -->
  <dialog use:modalDialog aria-labelledby="{id}-title" aria-describedby="{id}-body"
    oncancel={(event) => { event.preventDefault(); answer('cancel'); }}
    onclose={(event) => { if ((event.currentTarget as HTMLDialogElement).isConnected) answer('cancel'); }}
    onclick={(event) => { if (event.target === event.currentTarget) answer('cancel'); }}
    class="modal-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
    <div class="m-4 w-[28rem] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 text-gray-800 shadow-2xl">
      <h2 id="{id}-title" class="text-lg font-semibold">{$t('home.haveTitle')}</h2>
      <p id="{id}-body" class="mt-2 break-words text-sm text-gray-600">{$t('home.haveBody', { name: $importQuestion.name || 'Untitled Project' })}</p>
      <div class="mt-5 flex flex-col gap-3">
        {#each choices as choice (choice.answer)}
          <button type="button" onclick={() => answer(choice.answer)} aria-describedby="{id}-{choice.answer}"
            class="min-h-11 w-full rounded-xl border-2 px-4 py-2.5 text-left transition-colors
              {choice.answer === 'replace' ? 'border-blue-500 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'}">
            <span class="block font-semibold">{$t(choice.label)}</span>
            <span id="{id}-{choice.answer}" class="mt-0.5 block text-xs text-gray-500">{$t(choice.help)}</span>
          </button>
        {/each}
      </div>
    </div>
  </dialog>
{/if}
