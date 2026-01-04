import { type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CloseIcon } from './Icons';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: JSX.Element;
  size?: 'small' | 'medium' | 'large';
}

export function Modal(props: ModalProps) {
  const maxWidthClass = () => {
    switch (props.size) {
      case 'small':
        return 'max-w-sm';
      case 'large':
        return 'max-w-4xl';
      case 'medium':
      default:
        return 'max-w-md';
    }
  };

  return (
    <Portal>
      <div class="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div class="fixed inset-0 bg-black/50 transition-opacity" onClick={props.onClose} />

        {/* Modal */}
        <div class="flex min-h-screen items-center justify-center p-4">
          <div
            class={`relative z-10 w-full ${maxWidthClass()} rounded-lg bg-white p-6 shadow-xl`}
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
                <CloseIcon class="h-6 w-6" />
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
