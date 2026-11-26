/** Browser-only provider settings. Never part of projects, exports, or server requests. */
import { writable, readable, get } from 'svelte/store';
import { base } from '$app/paths';
import { normalizeBaseUrl, type OpenAIConfig } from '$lib/utils/openaiClient';

const SETTINGS_KEY = 'o3d_openai_settings';
const LEGACY_KEYS = ['o3d_openai_key', 'o3d_openai_base_url', 'o3d_openai_model'];
export interface OpenAISettings { apiKey: string; baseUrl: string; model: string }
const empty = (): OpenAISettings => ({ apiKey: '', baseUrl: '', model: '' });

function readSettings(): OpenAISettings {
  if (typeof window === 'undefined') return empty();
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const value = stored ? JSON.parse(stored) : {
      apiKey: localStorage.getItem(LEGACY_KEYS[0]), baseUrl: localStorage.getItem(LEGACY_KEYS[1]), model: localStorage.getItem(LEGACY_KEYS[2]),
    };
    return { apiKey: typeof value?.apiKey === 'string' ? value.apiKey : '', baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : '', model: typeof value?.model === 'string' ? value.model : '' };
  } catch { return empty(); }
}

export const openAISettings = writable<OpenAISettings>(readSettings());

export function saveOpenAISettings(config: OpenAIConfig): void {
  const settings = { apiKey: config.apiKey?.trim() || '', baseUrl: config.baseUrl?.trim() ? normalizeBaseUrl(config.baseUrl) : '', model: config.model?.trim() || '' };
  if (typeof window !== 'undefined') {
    // One write keeps credentials bound to their destination even if storage is full.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  }
  openAISettings.set(settings);
}

export function removeOpenAISettings(): void {
  if (typeof window !== 'undefined') {
    // Write an empty record before clearing legacy keys so old credentials cannot reappear.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(empty()));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  }
  openAISettings.set(empty());
}

export function setOpenAIModel(model: string): void {
  saveOpenAISettings({ ...get(openAISettings), model });
}

export function getGeminiKey(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('o3d_gemini_key'); } catch { return null; }
}
/** Keeps the Gemini key in this browser; a blank key removes it. Throws when storage refuses, so callers can say so. */
export function setGeminiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const value = key.trim();
  if (value) localStorage.setItem('o3d_gemini_key', value);
  else localStorage.removeItem('o3d_gemini_key');
}
export function hasGeminiKey(): boolean { return !!getGeminiKey(); }

/** The Claude helper's key and model: an Anthropic key (sk-ant-…) goes to Anthropic, an OpenRouter key (sk-or-…) to OpenRouter. */
export interface ClaudeSettings { apiKey: string; model: 'opus' | 'sonnet' }
export const viaOpenRouter = (key: string) => key.trim().startsWith('sk-or-');
const CLAUDE_KEY = 'o3d_claude_settings';
function readClaude(): ClaudeSettings {
  if (typeof window === 'undefined') return { apiKey: '', model: 'opus' };
  try {
    const value = JSON.parse(localStorage.getItem(CLAUDE_KEY) ?? '{}');
    return { apiKey: typeof value.apiKey === 'string' ? value.apiKey : '', model: value.model === 'sonnet' ? 'sonnet' : 'opus' };
  } catch { return { apiKey: '', model: 'opus' }; }
}
export const claudeSettings = writable<ClaudeSettings>(readClaude());
/** Throws when storage refuses, so callers can say so. The model is kept without a key, for the server's key. */
export function saveClaudeSettings(settings: ClaudeSettings): void {
  const value = { apiKey: settings.apiKey.trim(), model: settings.model };
  if (typeof window !== 'undefined') {
    if (value.apiKey || value.model !== 'opus') localStorage.setItem(CLAUDE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CLAUDE_KEY);
  }
  claudeSettings.set(value);
}

/** Whether the server this page came from holds a Claude key (`/api/claude`); asked once, false on any failure. */
export const serverClaude = readable(false, set => {
  if (typeof window === 'undefined') return;
  fetch(`${base}/api/claude`).then(r => r.ok ? r.json() : null).then(v => set(v?.available === true)).catch(() => {});
});
export function getOpenAIKey(): string | null { return get(openAISettings).apiKey || null; }
export function hasOpenAIKey(): boolean { return !!getOpenAIKey(); }
