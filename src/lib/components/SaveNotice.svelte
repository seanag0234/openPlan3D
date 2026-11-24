<script lang="ts">
  import { t } from '$lib/i18n';
  import { saveNotice } from '$lib/stores/saveStatus';

  // The notice clears itself after a while; a new notice starts the wait again.
  $effect(() => {
    if (!$saveNotice) return;
    const timer = setTimeout(() => saveNotice.set(null), 8000);
    return () => clearTimeout(timer);
  });
</script>

{#if $saveNotice}
  <div role="status" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] flex items-center gap-3 rounded-full border border-blue-200 bg-white py-2 pl-4 pr-2 text-sm text-slate-800 shadow-lg print-hide">
    <span>{$t($saveNotice)}</span>
    <button class="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={$t('saving.dismiss')} onclick={() => saveNotice.set(null)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
{/if}
