import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { MOTION_FAST } from '../../lib/motion';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
  /** Ms before auto-dismiss; 0 stays until dismissed. */
  duration: number;
}

export interface ToastOptions {
  /** Action button to show (e.g., Undo) */
  action?: ToastAction;
  /** Duration in ms before auto-dismiss (default: 3000, use 0 for no auto-dismiss) */
  duration?: number;
}

/** Offers the plans page, on a message about a plan limit. */
export const SEE_PLANS: ToastAction = {
  label: 'See plans',
  onClick: () => window.location.assign('/pricing'),
};

/** Toast options for a failed API call: a plan-limit refusal (403) offers "See plans". */
export const errorToastOptions = (statusCode: number | undefined): ToastOptions | undefined =>
  statusCode === 403 ? { action: SEE_PLANS } : undefined;

const MAX_TOASTS = 3;

/** How far a toast must be dragged sideways to dismiss it. */
const SWIPE_DISMISS_PX = 80;

const [toasts, setToasts] = createSignal<ToastMessage[]>([]);
// Toasts on their way out, by id: the direction they were swiped (0 if not swiped).
const [leaving, setLeaving] = createSignal<ReadonlyMap<string, number>>(new Map());
const [announcement, setAnnouncement] = createSignal('');

/**
 * Show a toast notification.
 *
 * @param type - 'success', 'error', or 'info'
 * @param message - The message to display
 * @param options - Optional action button and duration
 *
 * @example
 * // Simple toast
 * showToast('success', 'Item saved');
 *
 * @example
 * // Toast with undo action
 * showToast('success', 'Item moved to Backpack', {
 *   action: { label: 'Undo', onClick: () => undoMove() },
 *   duration: 5000
 * });
 */
export function showToast(type: ToastMessage['type'], message: string, options?: ToastOptions) {
  // Several failures at once (e.g. parallel page loads) show one message.
  const duplicate = toasts().find(
    (t) =>
      t.type === type &&
      t.message === message &&
      !t.action &&
      !options?.action &&
      !leaving().has(t.id)
  );
  if (duplicate) return duplicate.id;

  const id = Math.random().toString(36).slice(2, 11);
  // Error text takes longer to read than a short success/info confirmation.
  const defaultDuration = type === 'error' ? 6000 : options?.action ? 5000 : 3000;
  const duration = options?.duration ?? defaultDuration;

  // Only the newest few show; older ones are dropped, not just hidden, since
  // each one's timer runs only while it's on screen.
  const toast = { id, type, message, action: options?.action, duration };
  setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));
  return id;
}

/**
 * Dismiss a toast by ID. It animates out first: sideways in `swipe`'s
 * direction if it was swiped away, otherwise down.
 */
export function dismissToast(id: string, swipe = 0) {
  if (leaving().has(id) || !toasts().some((t) => t.id === id)) return;
  setLeaving((prev) => new Map(prev).set(id, swipe));
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setLeaving((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, MOTION_FAST);
}

/**
 * Tells screen readers about something shown in place rather than in a toast,
 * e.g. a button that turns into "✓ Added".
 */
export function announce(message: string) {
  // Clear first, so the same message twice is announced twice.
  setAnnouncement('');
  requestAnimationFrame(() => setAnnouncement(message));
}

const TOAST_COLORS: Record<ToastMessage['type'], string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
};

function ToastItem(props: { toast: ToastMessage }) {
  const [dragX, setDragX] = createSignal<number | null>(null);
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  let startX = 0;

  // The countdown waits while the toast is pressed, hovered or focused, so
  // there's time to read it or reach its action.
  const paused = () => dragX() !== null || hovered() || focused();
  let remaining = props.toast.duration;
  createEffect(() => {
    if (remaining <= 0 || paused()) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismissToast(props.toast.id), remaining);
    onCleanup(() => {
      clearTimeout(timer);
      remaining -= Date.now() - startedAt;
    });
  });

  const swipeOut = () => leaving().get(props.toast.id);
  const style = () => {
    const x = dragX();
    if (x !== null) return { transform: `translateX(${x}px)`, opacity: 1 - Math.abs(x) / 240 };
    const dir = swipeOut();
    if (dir) return { transform: `translateX(${dir * 120}%)`, opacity: 0 };
    return {};
  };

  const handleAction = () => {
    props.toast.action?.onClick();
    dismissToast(props.toast.id);
  };

  return (
    <div
      class={`relative mb-1.5 flex touch-pan-y items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm text-white shadow-lg select-none md:mb-2 md:gap-3 md:px-4 md:py-3 md:text-base ${TOAST_COLORS[props.toast.type]}`}
      classList={{
        'animate-toast-in': swipeOut() === undefined,
        'animate-toast-out': swipeOut() === 0,
        'transition-[transform,opacity] duration-150': dragX() === null,
      }}
      style={style()}
      role={props.toast.type === 'error' ? 'alert' : undefined}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button')) return;
        startX = e.clientX;
        setDragX(0);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (dragX() !== null) setDragX(e.clientX - startX);
      }}
      onPointerUp={() => {
        const x = dragX() ?? 0;
        setDragX(null);
        if (Math.abs(x) >= SWIPE_DISMISS_PX) dismissToast(props.toast.id, Math.sign(x));
      }}
      onPointerCancel={() => setDragX(null)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setFocused(true)}
      onFocusOut={() => setFocused(false)}
    >
      <span class="min-w-0 flex-1 wrap-anywhere">{props.toast.message}</span>
      <Show when={props.toast.action}>
        {(action) => (
          <button
            onClick={handleAction}
            class="flex-shrink-0 rounded bg-white/20 px-2 py-1 text-sm font-medium whitespace-nowrap hover:bg-white/30"
          >
            {action().label}
          </button>
        )}
      </Show>
      {/* How long the action stays available. */}
      <Show when={props.toast.action && props.toast.duration > 0}>
        <span
          data-motion="essential"
          class="animate-drain absolute inset-x-0 bottom-0 h-1 origin-left bg-white/50"
          style={{
            'animation-duration': `${props.toast.duration}ms`,
            'animation-play-state': paused() ? 'paused' : 'running',
          }}
          aria-hidden="true"
        />
      </Show>
    </div>
  );
}

export function Toast() {
  return (
    <Portal>
      {/* The wrapper is the live region and stays mounted even with no
          toasts: screen readers only announce changes inside a region that
          already existed. Errors also get role="alert" to interrupt. */}
      <div
        role="status"
        aria-live="polite"
        class="fixed right-4 bottom-[calc(1rem+var(--app-nav-height,0px))] z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-stretch md:max-w-sm print:hidden"
      >
        <For each={toasts()}>{(toast) => <ToastItem toast={toast} />}</For>
        <span class="sr-only">{announcement()}</span>
      </div>
    </Portal>
  );
}
