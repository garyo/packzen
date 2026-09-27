import { Show } from 'solid-js';
import { render } from 'solid-js/web';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label for the confirming button (default "OK"). */
  confirmLabel?: string;
  /** Styles the confirming button as destructive. */
  destructive?: boolean;
}

/**
 * Ask the user to confirm, as an accessible in-app dialog. Resolves true on
 * confirm, false on cancel/Escape/backdrop. Drop-in for `window.confirm`:
 *
 *   if (!(await confirmDialog({ title: 'Delete trip?', destructive: true }))) return;
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const finish = (confirmed: boolean) => {
      dispose();
      host.remove();
      resolve(confirmed);
    };
    const dispose = render(
      () => (
        <Modal title={options.title} size="small" onClose={() => finish(false)}>
          <Show when={options.message}>
            <p class="mb-6 text-gray-600">{options.message}</p>
          </Show>
          <div class="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button
              variant={options.destructive ? 'danger' : 'primary'}
              onClick={() => finish(true)}
            >
              {options.confirmLabel ?? 'OK'}
            </Button>
          </div>
        </Modal>
      ),
      host
    );
  });
}
