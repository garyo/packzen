/**
 * Small animations started from code, through the Web Animations API.
 * Transitions use global.css's motion tokens (mirrored below); the ones meant
 * to catch the eye (shake, flash, pop) run longer on purpose. CSS's
 * reduced-motion rule doesn't reach the Web Animations API, so each helper
 * checks the preference itself.
 */

import { createSignal, onCleanup, type Accessor } from 'solid-js';

/** Mirror global.css's --motion-fast, --motion-base and --ease-out-soft. */
export const MOTION_FAST = 150;
export const MOTION_BASE = 250;
export const EASE_OUT_SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A quick side-to-side shake, e.g. for a field that failed validation. */
export function shake(el: Element | null | undefined) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [0, -6, 6, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 300, easing: 'ease-out' }
  );
}

/** flash(): amber-100, held a moment, then faded out. */
const FLASH_COLOR = '#fef3c7';
const FLASH_MS = 1500;

/** pop(): slower and gentler than the checkbox's CSS animate-pop, so text has time to register. */
const POP_MS = 700;
const POP_SCALE = 1.2;

/** Briefly tints an element so the eye finds it, e.g. a row that was just added. */
export function flash(el: Element | null | undefined) {
  if (!el) return;
  // Reduced motion still gets the tint; it fades without movement.
  el.animate(
    [
      { backgroundColor: FLASH_COLOR, offset: 0 },
      { backgroundColor: FLASH_COLOR, offset: 0.4 },
    ],
    { duration: FLASH_MS, easing: 'ease-out' }
  );
}

/** Swells an element briefly. Inline elements need inline-block. */
export function pop(el: Element | null | undefined) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${POP_SCALE})` }, { transform: 'scale(1)' }],
    { duration: POP_MS, easing: EASE_OUT_SOFT }
  );
}

/** Scrolls an element into view and flashes it. */
export function reveal(el: Element | null | undefined, block: ScrollLogicalPosition = 'center') {
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block });
  flash(el);
}

/**
 * Folds an element's height and opacity to nothing and holds it there. Resolves
 * once done; the caller removes the element (or cancels the animation to bring
 * it back).
 */
export async function collapse(el: HTMLElement): Promise<Animation | undefined> {
  if (prefersReducedMotion()) return undefined;
  const animation = el.animate(
    [
      { height: `${el.offsetHeight}px`, opacity: 1, overflow: 'hidden' },
      { height: '0px', opacity: 0, overflow: 'hidden' },
    ],
    { duration: MOTION_BASE, easing: EASE_OUT_SOFT, fill: 'forwards' }
  );
  await animation.finished.catch(() => {});
  return animation;
}

/** A flag that turns itself off `ms` after each `raise()`, e.g. a button's "✓ Added" state. */
export function createFlag(ms: number): [Accessor<boolean>, () => void] {
  const [on, setOn] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const raise = () => {
    clearTimeout(timer);
    setOn(true);
    timer = setTimeout(() => setOn(false), ms);
  };
  onCleanup(() => clearTimeout(timer));
  return [on, raise];
}
