import { createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { CloseIcon } from './Icons';
import { confirmDialog } from './ConfirmDialog';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: JSX.Element;
  size?: 'small' | 'medium' | 'large';
  /**
   * When provided and returning true, dismissing via backdrop or Escape asks
   * before discarding. The explicit close button always closes.
   */
  isDirty?: () => boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD_SELECTOR = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

// Open modals, innermost last. Only the topmost one reacts to Escape/Tab, and
// the page behind stays scroll-locked while any modal is open.
const modalStack: symbol[] = [];

/** Whether any modal is open, for page-level keys (like Escape) that should defer to it. */
export const isModalOpen = () => modalStack.length > 0;

export function Modal(props: ModalProps) {
  const titleId = createUniqueId();
  const stackId = Symbol('modal');
  let containerRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;

  const isTopmost = () => modalStack[modalStack.length - 1] === stackId;

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

  const visible = (el: HTMLElement) => el.offsetParent !== null;
  const getFocusable = () =>
    containerRef
      ? Array.from(containerRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(visible)
      : [];

  const dismiss = async () => {
    if (
      props.isDirty?.() &&
      !(await confirmDialog({
        title: 'Discard your changes?',
        confirmLabel: 'Discard',
        destructive: true,
      }))
    ) {
      return;
    }
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isTopmost()) return;
    if (e.key === 'Escape') {
      // Let an inner control that already handled Escape (e.g. a Combobox
      // closing its dropdown, which preventDefaults) suppress the modal close,
      // so Escape dismisses the topmost layer rather than both at once.
      if (e.defaultPrevented) return;
      e.preventDefault();
      void dismiss();
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
    modalStack.push(stackId);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    // Focus the first form field; otherwise the dialog itself, so no button
    // (e.g. the close button, where Enter would dismiss) shows a focus ring.
    const field = Array.from(contentRef?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? []).find(
      visible
    );
    (field ?? containerRef)?.focus();
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
    modalStack.splice(modalStack.indexOf(stackId), 1);
    if (modalStack.length === 0) document.body.style.overflow = '';
    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus();
    }
  });

  return (
    <Portal>
      <div class="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div class="fixed inset-0 bg-black/50 transition-opacity" onClick={() => void dismiss()} />

        {/* Modal */}
        <div class="flex min-h-screen items-center justify-center p-4">
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            class={`relative z-10 flex max-h-[90dvh] w-full flex-col outline-none ${maxWidthClass()} rounded-lg bg-white shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="flex flex-shrink-0 items-center justify-between gap-2 px-6 pt-6 pb-4">
              <h2 id={titleId} class="min-w-0 text-xl font-semibold wrap-anywhere text-gray-900">
                {props.title}
              </h2>
              <button
                type="button"
                onClick={props.onClose}
                class="flex-shrink-0 text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Close"
              >
                <CloseIcon class="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div ref={contentRef} class="flex-1 overflow-y-auto px-6 pb-6">
              {props.children}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
