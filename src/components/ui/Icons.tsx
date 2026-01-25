/**
 * Icon Components
 *
 * Reusable SVG icon components for consistent usage throughout the app.
 * All icons accept a `class` prop for sizing (e.g., "h-4 w-4", "h-5 w-5").
 */

import type { JSX } from 'solid-js';

interface IconProps {
  class?: string;
}

/** Pencil/Edit icon */
export function EditIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

/** Trash/Delete icon */
export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/** X/Close icon */
export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-6 w-6'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

/** Home icon */
export function HomeIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

/** Chevron left / Back arrow icon */
export function ChevronLeftIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

/** Search / Magnifying glass icon */
export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
      />
    </svg>
  );
}

/** Vertical three dots / More menu icon */
export function MoreVerticalIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="19" r="2.5" />
    </svg>
  );
}

/** User / Person icon */
export function UserIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

/** Checkmark icon */
export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Drag handle (6 dots in 2x3 grid) icon */
export function DragHandleIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-5 w-5'} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

/** Copy / Duplicate icon */
export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-5 w-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

/** Plus icon */
export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
  );
}

/** Question mark in circle / Help icon */
export function HelpIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-6 w-6'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/** Document / Notes icon */
export function NotesIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/** Skip icon (circle with diagonal line / "not needed") */
export function SkipIcon(props: IconProps): JSX.Element {
  return (
    <svg class={props.class ?? 'h-4 w-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" stroke-width="2" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19L19 5" />
    </svg>
  );
}
