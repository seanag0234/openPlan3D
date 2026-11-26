<script lang="ts">
  import { t } from '$lib/i18n';
  import { claudeSettings, saveClaudeSettings, serverClaude, viaOpenRouter, type ClaudeSettings } from '$lib/stores/aiKeys';

  let key = $state($claudeSettings.apiKey);
  let model = $state<ClaudeSettings['model']>($claudeSettings.model);
  let visible = $state(false);
  let saved = $state(false);
  let failed = $state(false);

  function save(apiKey = key) {
    failed = false;
    try { saveClaudeSettings({ apiKey, model }); } catch { failed = true; return; }
    key = apiKey;
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }
</script>

<div>
  <span class="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{$t('panels.claudeKey')}</span>
  <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{$t('panels.claudeKeyDesc')}</p>
  {#if $serverClaude}<p class="text-xs text-green-700 dark:text-green-400 mb-3" data-testid="claude-server-key">{$t('panels.claudeServerKey')}</p>{/if}
  <div class="relative">
    <input
      type={visible ? 'text' : 'password'} value={key} aria-label={$t('panels.claudeKey')}
      oninput={(e) => { key = e.currentTarget.value; failed = false; }}
      class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-slate-500 bg-white dark:bg-gray-700 dark:text-gray-100"
      placeholder="sk-ant-… or sk-or-…"
    />
    <button class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm" onclick={() => visible = !visible}
      aria-label={visible ? $t('settings.hideKey') : $t('settings.showKey')}>{visible ? '🙈' : '👁️'}</button>
  </div>
  {#if key.trim()}<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{$t(viaOpenRouter(key) ? 'panels.claudeViaOpenRouter' : 'panels.claudeViaAnthropic')}</p>{/if}
  <label class="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
    {$t('panels.claudeModel')}
    <select bind:value={model} onchange={() => save($claudeSettings.apiKey)}
      class="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100">
      <option value="opus">{$t('panels.claudeOpus')}</option>
      <option value="sonnet">{$t('panels.claudeSonnet')}</option>
    </select>
  </label>
  <div class="flex gap-2 mt-3">
    <button class="px-4 py-2 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-600" onclick={() => save()}>
      {saved ? $t('settings.saved') : $t('settings.saveKey')}
    </button>
    {#if $claudeSettings.apiKey}
      <button class="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50" onclick={() => save('')}>{$t('settings.remove')}</button>
    {/if}
  </div>
  {#if failed}<p role="alert" class="mt-2 text-xs text-red-600">{$t('settings.geminiKeySaveFailed')}</p>{/if}
</div>
