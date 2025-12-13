import { type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: JSX.Element;
}

export function Modal(props: ModalProps) {
  return (
    <Portal>
      <div class="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          class="bg-opacity-50 fixed inset-0 bg-black transition-opacity"
          onClick={props.onClose}
        />

        {/* Modal */}
        <div class="flex min-h-screen items-center justify-center p-4">
          <div
            class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900">{props.title}</h2>
              <button
                onClick={props.onClose}
                class="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Close modal"
              >
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div>{props.children}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
