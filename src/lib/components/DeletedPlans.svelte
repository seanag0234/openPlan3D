<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { bringBack, listDeletedPlans, type DeletedPlan } from '$lib/services/onlineHistory';

  /** Runs once a plan is back in the online library, so the list can show it. */
  let { onrestored }: { onrestored: () => Promise<void> } = $props();

  let open = $state(false);
  let plans = $state<DeletedPlan[] | null>(null);
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function toggle() {
    open = !open;
    if (!open) return;
    plans = null;
    try { plans = await listDeletedPlans(); error = null; }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  async function restore(plan: DeletedPlan) {
    busy = plan.id;
    try {
      await bringBack(plan);
      plans = (plans ?? []).filter(other => other.id !== plan.id);
      error = null;
      await onrestored();
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { busy = null; }
  }
</script>

<button class="font-semibold text-blue-600 underline" aria-expanded={open} onclick={toggle}>{$t('library.deleted')}</button>
{#if open}
  <section aria-label={$t('library.deleted')} class="basis-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
    {#if error}<p role="alert" class="text-red-700">{projectServiceMessage(error, $locale)}</p>
    {:else if plans === null}<p role="status" class="text-gray-500">{$t('library.deletedLoading')}</p>
    {:else if plans.length === 0}<p class="text-gray-500">{$t('library.deletedEmpty')}</p>{/if}
    {#each plans ?? [] as plan (plan.id)}
      <div class="flex items-center justify-between gap-3 py-1">
        <span class="min-w-0 truncate">{plan.name || $t('library.untitled')}
          <span class="text-xs text-gray-400">{$t('library.deletedAt', { when: new Date(plan.deletedAt).toLocaleString($locale === 'pt' ? 'pt-BR' : 'en') })}</span>
        </span>
        <button class="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          disabled={busy !== null} onclick={() => restore(plan)}>{$t('library.bringBack')}</button>
      </div>
    {/each}
  </section>
{/if}

