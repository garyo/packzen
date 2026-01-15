/**
 * TripNotesButton Component
 *
 * Floating button for accessing trip notes.
 * Shows a blue dot indicator when notes exist.
 * Mobile-responsive with larger touch targets on mobile.
 */

import { NotesIcon } from '../ui/Icons';

interface TripNotesButtonProps {
  hasNotes: boolean;
  isOpen: boolean;
  onClick: () => void;
}

export function TripNotesButton(props: TripNotesButtonProps) {
  return (
    <button
      onClick={props.onClick}
      class={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors md:h-6 md:w-6 ${
        props.isOpen
          ? 'bg-amber-100 text-amber-700'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
      }`}
      title={props.hasNotes ? 'View trip notes' : 'Add trip notes'}
      aria-label={props.hasNotes ? 'View trip notes' : 'Add trip notes'}
    >
      <NotesIcon class="h-5 w-5 md:h-4 md:w-4" />

      {/* Blue dot indicator when notes exist */}
      {props.hasNotes && !props.isOpen && (
        <span
          class="absolute h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white md:h-2 md:w-2"
          style="top: 3px; right: 2px"
        />
      )}
    </button>
  );
}
