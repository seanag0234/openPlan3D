<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  let { message, onDismiss, title }: { message: string; onDismiss: () => void; title?: string } = $props();
  /** A file that is not a plan at all: said plainly, with the technical words kept under Details. */
  const notAPlan = $derived(/Invalid project:|not valid JSON|Unexpected token|Unexpected end|JSON\.parse/i.test(message));
</script>

<div role="alert" class="fixed top-16 left-1/2 -translate-x-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-red-200 bg-white p-4 shadow-xl">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="font-semibold text-red-800">{title ?? $t('importError.title')}</p>
      {#if notAPlan}
        <p class="mt-1 text-sm text-gray-700">{$t('home.notAPlan')}</p>
        <details class="mt-2 text-xs text-gray-500">
          <summary class="cursor-pointer select-none py-1 font-semibold">{$t('home.details')}</summary>
          <p class="mt-1 break-words">{projectServiceMessage(message, $locale)}</p>
        </details>
      {:else}
        <p class="mt-1 text-sm text-gray-700">{projectServiceMessage(message, $locale)}</p>
        <p class="mt-2 text-xs text-gray-500">{$t('importError.help')}</p>
      {/if}
    </div>
    <button aria-label={$t('importError.dismiss')} class="rounded px-2 py-1 text-gray-600 hover:bg-gray-100" onclick={onDismiss}>✕</button>
  </div>
</div>
