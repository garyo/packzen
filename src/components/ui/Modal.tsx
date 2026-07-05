import { createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CloseIcon } from './Icons';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: JSX.Element;
  size?: 'small' | 'medium' | 'large';
  /**
   * When true, a backdrop click asks for confirmation before discarding
   * (via `window.confirm`) instead of closing immediately. Defaults to
   * false, which preserves the original instant-close behavior.
   */
  confirmDiscardOnBackdrop?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal(props: ModalProps) {
  const titleId = createUniqueId();
  let containerRef: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;

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

  const getFocusable = () =>
    containerRef
      ? Array.from(containerRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null
        )
      : [];

  const handleBackdropClick = () => {
    if (props.confirmDiscardOnBackdrop && !window.confirm('Discard your changes?')) {
      return;
    }
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Let an inner control that already handled Escape (e.g. a Combobox
      // closing its dropdown, which preventDefaults) suppress the modal close,
      // so Escape dismisses the topmost layer rather than both at once.
      if (e.defaultPrevented) return;
      props.onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  onMount(() => {
    previouslyFocused = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);
    (getFocusable()[0] ?? containerRef)?.focus();
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus();
    }
  });

  return (
    <Portal>
      <div class="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div class="fixed inset-0 bg-black/50 transition-opacity" onClick={handleBackdropClick} />

        {/* Modal */}
        <div class="flex min-h-screen items-center justify-center p-4">
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            class={`relative z-10 flex max-h-[90dvh] w-full flex-col ${maxWidthClass()} rounded-lg bg-white shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="flex flex-shrink-0 items-center justify-between px-6 pt-6 pb-4">
              <h2 id={titleId} class="text-xl font-semibold text-gray-900">
                {props.title}
              </h2>
              <button
                onClick={props.onClose}
                class="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Close modal"
              >
                <CloseIcon class="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div class="flex-1 overflow-y-auto px-6 pb-6">{props.children}</div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
