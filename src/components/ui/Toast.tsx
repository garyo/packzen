import { createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
}

export interface ToastOptions {
  /** Action button to show (e.g., Undo) */
  action?: ToastAction;
  /** Duration in ms before auto-dismiss (default: 3000, use 0 for no auto-dismiss) */
  duration?: number;
}

const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

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
  const id = Math.random().toString(36).substr(2, 9);
  const duration = options?.duration ?? (options?.action ? 5000 : 3000);

  setToasts((prev) => [...prev, { id, type, message, action: options?.action }]);

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

/**
 * Dismiss a toast by ID.
 */
export function dismissToast(id: string) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

export function Toast() {
  const getStyles = (type: ToastMessage['type']) => {
    const base = 'px-4 py-3 rounded-lg shadow-lg text-white mb-2 flex items-center gap-3';
    switch (type) {
      case 'success':
        return `${base} bg-green-600`;
      case 'error':
        return `${base} bg-red-600`;
      case 'info':
        return `${base} bg-blue-600`;
    }
  };

  const handleAction = (toast: ToastMessage) => {
    if (toast.action) {
      toast.action.onClick();
      dismissToast(toast.id);
    }
  };

  return (
    <Show when={toasts().length > 0}>
      <Portal>
        <div class="fixed right-4 bottom-4 z-50 flex flex-col">
          <For each={toasts()}>
            {(toast) => (
              <div class={getStyles(toast.type)}>
                <span class="flex-1">{toast.message}</span>
                <Show when={toast.action}>
                  <button
                    onClick={() => handleAction(toast)}
                    class="rounded bg-white/20 px-2 py-1 text-sm font-medium hover:bg-white/30"
                  >
                    {toast.action!.label}
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
}
