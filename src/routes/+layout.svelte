<script>
  import '../app.css';
  import '../touch-targets.css';
  import '../comfort.css';
  import { initializeLocale } from '$lib/i18n';
  onMount(initializeLocale);
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { themePreference } from '$lib/stores/theme';
  import DeploymentNotice from '$lib/components/DeploymentNotice.svelte';
  import FeedbackSheet from '$lib/components/FeedbackSheet.svelte';
  import ImportQuestionDialog from '$lib/components/ImportQuestionDialog.svelte';
  // Self-hosted instances and browser tests can run without sending analytics.
  onMount(() => { if (window.location.pathname !== '/render-lab' && env.PUBLIC_ENABLE_ANALYTICS !== 'false') void import('$lib/firebase'); });
  let { children } = $props();
</script>

{@render children()}
<DeploymentNotice />
<FeedbackSheet />
<ImportQuestionDialog />
