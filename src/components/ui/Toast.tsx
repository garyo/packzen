import { createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

const [toasts, setToasts] = createSignal<ToastMessage[]>([]);

export function showToast(type: ToastMessage['type'], message: string) {
  const id = Math.random().toString(36).substr(2, 9);
  setToasts((prev) => [...prev, { id, type, message }]);

  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 3000);
}

export function Toast() {
  const getStyles = (type: ToastMessage['type']) => {
    const base = 'px-4 py-3 rounded-lg shadow-lg text-white mb-2';
    switch (type) {
      case 'success':
        return `${base} bg-green-600`;
      case 'error':
        return `${base} bg-red-600`;
      case 'info':
        return `${base} bg-blue-600`;
    }
  };

  return (
    <Show when={toasts().length > 0}>
      <Portal>
        <div class="fixed bottom-4 right-4 z-50 flex flex-col">
          <For each={toasts()}>
            {(toast) => <div class={getStyles(toast.type)}>{toast.message}</div>}
          </For>
        </div>
      </Portal>
    </Show>
  );
}
