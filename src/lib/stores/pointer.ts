import { readable } from 'svelte/store';

/** Follows a media query; `fallback` holds where there is no window (SSR, tests). */
function media(query: string, fallback: boolean) {
  return readable(fallback, set => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const on = () => set(list.matches);
    on();
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  });
}

/** The main pointer is a finger, not a mouse or pen. */
export const coarsePointer = media('(pointer: coarse)', false);
/** The main pointer can hover. */
export const canHover = media('(hover: hover)', true);
