/**
 * TripNotesPanel Component
 *
 * Expandable panel for viewing and editing trip notes.
 * Auto-saves on blur and as you type (debounced), showing "Saving…" then "✓ Saved".
 * Mobile-responsive layout with auto-growing textarea.
 * URLs in notes are clickable when in view mode.
 */

import { createSignal, createEffect, onCleanup, onMount, Show } from 'solid-js';
import { CheckIcon } from '../ui/Icons';

/** How long "✓ Saved" stays before fading. */
const SAVED_SHOWN_MS = 2000;

// Convert URLs in text to clickable links
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?"'\])}>])/g;
  const parts: Array<{ type: 'text' | 'link'; content: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add the URL
    parts.push({ type: 'link', content: match[1] });
    lastIndex = match.index + match[1].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

interface TripNotesPanelProps {
  notes: string;
  /** Saves the notes; resolves to whether the save succeeded. */
  onNotesChange: (notes: string) => Promise<boolean>;
  onClose: () => void;
}

export function TripNotesPanel(props: TripNotesPanelProps) {
  const [localNotes, setLocalNotes] = createSignal(props.notes || '');
  const [saveState, setSaveState] = createSignal<'idle' | 'saving' | 'saved'>('idle');
  const [isEditing, setIsEditing] = createSignal(!props.notes); // Start in edit mode if no notes

  // Sync from props when not actively editing (e.g. from SSE sync)
  createEffect(() => {
    const incoming = props.notes || '';
    if (!isEditing()) {
      setLocalNotes(incoming);
    }
  });
  let saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let savedTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let latestSave = 0;
  let textareaRef: HTMLTextAreaElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  // Click outside to close. Uses the event's composed path rather than
  // `contains(target)`: clicking the notes swaps them for the textarea, which
  // detaches the clicked node before this document listener runs.
  const handleClickOutside = (e: MouseEvent) => {
    if (panelRef && !e.composedPath().includes(panelRef)) {
      // Save before closing if there are changes
      if (localNotes() !== props.notes) {
        void props.onNotesChange(localNotes());
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
    clearTimeout(savedTimeoutId);
    document.removeEventListener('click', handleClickOutside);
  });

  const saveNotes = async (value: string) => {
    if (value === props.notes) return;
    const save = ++latestSave;
    clearTimeout(savedTimeoutId);
    setSaveState('saving');
    // A failed save shows its own error toast.
    const saved = await props.onNotesChange(value);
    if (save !== latestSave) return; // A newer save owns the status.
    setSaveState(saved ? 'saved' : 'idle');
    if (saved) savedTimeoutId = setTimeout(() => setSaveState('idle'), SAVED_SHOWN_MS);
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
      void saveNotes(value);
    }, 1500);
  };

  const handleBlur = () => {
    // Save immediately on blur if there are unsaved changes
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }

    void saveNotes(localNotes());
    // Exit edit mode if there's content
    if (localNotes().trim()) {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isEditing() && localNotes().trim()) {
      e.preventDefault();
      // Save and exit edit mode
      void saveNotes(localNotes());
      setIsEditing(false);
    }
  };

  const enterEditMode = () => {
    setIsEditing(true);
    // Focus textarea after render
    requestAnimationFrame(() => {
      textareaRef?.focus();
      adjustHeight();
    });
  };

  // Render linkified text preserving newlines
  const renderLinkedNotes = () => {
    const lines = localNotes().split('\n');
    return lines.map((line, lineIndex) => (
      <>
        {lineIndex > 0 && <br />}
        {linkifyText(line).map((part) =>
          part.type === 'link' ? (
            <a
              href={part.content}
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 underline hover:text-blue-800"
              onClick={(e) => e.stopPropagation()}
            >
              {part.content}
            </a>
          ) : (
            <>{part.content}</>
          )
        )}
      </>
    ));
  };

  return (
    <div ref={panelRef} class="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-1.5 shadow-sm">
      <div class="mb-1 flex items-center justify-between px-0.5">
        <span class="text-xs font-medium text-amber-700">Trip Notes</span>
        {/* "✓ Saved" fades out in place, rather than vanishing. */}
        <span
          class="flex items-center gap-1 text-xs text-amber-700 transition-opacity duration-500"
          classList={{ 'opacity-0': saveState() === 'idle' }}
          aria-hidden={saveState() === 'idle'}
          aria-live="polite"
        >
          <Show
            when={saveState() === 'saving'}
            fallback={
              <>
                <CheckIcon class="h-3 w-3" />
                Saved
              </>
            }
          >
            Saving…
          </Show>
        </span>
      </div>

      <Show
        when={isEditing()}
        fallback={
          <div
            onClick={enterEditMode}
            class="min-h-[80px] w-full cursor-text rounded border border-amber-200 bg-white p-2 text-sm whitespace-pre-wrap text-gray-800"
            style="font-size: 16px; max-height: 400px; overflow-y: auto"
          >
            {renderLinkedNotes()}
          </div>
        }
      >
        <textarea
          ref={textareaRef}
          value={localNotes()}
          onInput={(e) => handleChange(e.currentTarget.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Add notes..."
          class="w-full rounded border border-amber-200 bg-white p-2 text-sm text-gray-800 placeholder-gray-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
          style="font-size: 16px; min-height: 80px; max-height: 400px; overflow-y: auto"
          maxLength={10000}
          onFocus={adjustHeight}
        />
      </Show>
    </div>
  );
}
