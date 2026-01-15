/**
 * TripNotesPanel Component
 *
 * Expandable panel for viewing and editing trip notes.
 * Auto-saves on blur with debouncing.
 * Mobile-responsive layout with auto-growing textarea.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';

interface TripNotesPanelProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
}

export function TripNotesPanel(props: TripNotesPanelProps) {
  // Initialize from props once - don't sync afterwards to avoid overwriting user input
  const [localNotes, setLocalNotes] = createSignal(props.notes || '');
  const [isSaving, setIsSaving] = createSignal(false);
  let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let textareaRef: HTMLTextAreaElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  // Click outside to close
  const handleClickOutside = (e: MouseEvent) => {
    if (panelRef && !panelRef.contains(e.target as Node)) {
      // Save before closing if there are changes
      if (localNotes() !== props.notes) {
        props.onNotesChange(localNotes());
      }
      props.onClose();
    }
  };

  onMount(() => {
    // Delay adding listener to avoid immediate close from the click that opened it
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    // Adjust height on mount to show existing content
    requestAnimationFrame(() => adjustHeight());
  });

  // Cleanup timeout and listener on unmount
  onCleanup(() => {
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
    }
    document.removeEventListener('click', handleClickOutside);
  });

  const saveNotes = (value: string) => {
    if (value !== props.notes) {
      setIsSaving(true);
      props.onNotesChange(value);
      // Reset saving indicator after a brief moment
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  // Auto-grow textarea to fit content, capped at max height
  const MIN_HEIGHT = 80;
  const MAX_HEIGHT = 400; // ~20 lines, then scroll internally

  const adjustHeight = () => {
    if (textareaRef) {
      textareaRef.style.height = 'auto';
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, textareaRef.scrollHeight));
      textareaRef.style.height = `${newHeight}px`;
    }
  };

  const handleChange = (value: string) => {
    setLocalNotes(value);
    adjustHeight();

    // Debounce save - wait 1.5 seconds after last keystroke
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
    }

    saveTimeoutId = setTimeout(() => {
      saveNotes(value);
    }, 1500);
  };

  const handleBlur = () => {
    // Save immediately on blur if there are unsaved changes
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }

    saveNotes(localNotes());
  };

  return (
    <div
      ref={panelRef}
      class="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 p-1.5 shadow-sm md:mx-3 md:mb-1.5"
    >
      <div class="mb-1 flex items-center justify-between px-0.5">
        <span class="text-xs font-medium text-amber-700">Trip Notes</span>
        {isSaving() && <span class="text-xs text-amber-600">Saving...</span>}
      </div>

      <textarea
        ref={textareaRef}
        value={localNotes()}
        onInput={(e) => handleChange(e.currentTarget.value)}
        onBlur={handleBlur}
        placeholder="Add notes..."
        class="w-full rounded border border-amber-200 bg-white p-2 text-sm text-gray-800 placeholder-gray-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
        style="font-size: 16px; min-height: 80px; max-height: 400px; overflow-y: auto"
        maxLength={10000}
        onFocus={adjustHeight}
      />
    </div>
  );
}
