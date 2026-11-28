import { writable } from 'svelte/store';

export type ThemePreference = 'light' | 'dark' | 'system' | 'soft' | 'rose' | 'dim' | 'night';
/** The looks that are easier on the eyes; each sits on the light theme and filters the whole page. */
export const COMFORT_LOOKS = ['soft', 'rose', 'dim', 'night'] as const;
const isComfort = (pref: ThemePreference) => (COMFORT_LOOKS as readonly string[]).includes(pref);

/** One listener per page for writes another tab makes; each store adds its keys. */
const storageHandlers = new Map<string, (newValue: string | null) => void>();
function onStorage(key: string, handler: (newValue: string | null) => void) {
  if (typeof window === 'undefined') return;
  if (storageHandlers.size === 0) {
    window.addEventListener('storage', (event) => {
      if (event.key !== null) storageHandlers.get(event.key)?.(event.newValue);
    });
  }
  storageHandlers.set(key, handler);
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be disabled (site data blocked).
    return null;
  }
}

/** Light until someone picks a theme, even on a device set to dark; System follows the device. */
const DEFAULT_THEME: ThemePreference = 'light';

function getStoredTheme(): ThemePreference {
  return (readStorage('o3d_theme') as ThemePreference | null) || DEFAULT_THEME;
}

function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (isComfort(pref)) return 'light';
  if (pref === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref === 'dark' ? 'dark' : 'light';
}

function applyTheme(pref: ThemePreference) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // Attributes first, and through ?.: the dark toggle stays the last classList call, and a page with no such method is left alone.
  if (isComfort(pref)) root.setAttribute?.('data-comfort', pref); else root.removeAttribute?.('data-comfort');
  root.classList.toggle('dark', resolveTheme(pref) === 'dark');
}

function createThemeStore() {
  const initial = getStoredTheme();
  // This session's choice; storage may be unable to keep it.
  let preference = initial;
  const { subscribe, set } = writable<ThemePreference>(initial);

  // Apply on creation
  applyTheme(initial);

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (preference === 'system') {
        applyTheme('system');
      }
    });
  }
  // Another tab saved a theme: apply it here as a reload would, so it also holds when the system theme changes.
  onStorage('o3d_theme', (newValue) => {
    preference = (newValue as ThemePreference | null) || DEFAULT_THEME;
    set(preference);
    applyTheme(preference);
  });

  return {
    subscribe,
    set(value: ThemePreference) {
      preference = value;
      set(value);
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('o3d_theme', value); } catch { /* The choice still applies for this session. */ }
      }
      applyTheme(value);
    },
  };
}

export const themePreference = createThemeStore();

function applyLessMotion(on: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (on) root.setAttribute?.('data-less-motion', ''); else root.removeAttribute?.('data-less-motion');
}

function createLessMotionStore() {
  const initial = readStorage('o3d_less_motion') === '1';
  const { subscribe, set } = writable<boolean>(initial);
  applyLessMotion(initial);

  // Another tab switched it: follow, as a reload would.
  onStorage('o3d_less_motion', (newValue) => {
    const on = newValue === '1';
    set(on);
    applyLessMotion(on);
  });

  return {
    subscribe,
    set(value: boolean) {
      set(value);
      if (typeof window !== 'undefined') {
        try {
          if (value) localStorage.setItem('o3d_less_motion', '1');
          else localStorage.removeItem('o3d_less_motion');
        } catch { /* The choice still applies for this session. */ }
      }
      applyLessMotion(value);
    },
  };
}

/** True when fades and slides are switched off for this device. */
export const lessMotion = createLessMotionStore();
