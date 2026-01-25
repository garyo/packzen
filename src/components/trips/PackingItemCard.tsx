/**
 * PackingItemCard Component
 *
 * Reusable item card for packing lists
 * Extracted from PackingPage to reduce code duplication
 *
 * On mobile: action buttons hidden by default, revealed via swipe gesture
 * On desktop (md: breakpoint and up): action buttons always visible
 */

import { Show, createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import type { TripItem, Bag } from '../../lib/types';
import { DragHandleIcon, EditIcon, SkipIcon } from '../ui/Icons';
import { SwipeToReveal } from '../ui/SwipeToReveal';

// Type for drag activators from solid-dnd
type DragActivators = Record<string, (event: any) => void>;

interface PackingItemCardProps {
  item: TripItem;
  selectMode: boolean;
  isSelected: boolean;
  bag?: Bag | null;
  showBagInfo?: boolean;
  showCategoryInfo?: boolean;
  categoryIcon?: string; // Icon for the item's category (used for containers)
  onTogglePacked: () => void;
  onToggleSkipped: () => void;
  onEdit: () => void;
  onToggleSelection: () => void;
  // Container-specific props
  containerContentsCount?: number; // Number of items inside (if this is a container)
  containerPackedCount?: number; // Number of packed items inside (if this is a container)
  onContainerClick?: () => void; // Click handler for navigating to container section
  // Drag-and-drop props
  dragActivators?: DragActivators; // Event handlers for drag handle
  isDragging?: boolean; // Whether this item is currently being dragged
  // Swipe-to-reveal props (for mobile)
  revealedItemId?: Accessor<string | null>;
  onRevealChange?: (itemId: string | null) => void;
}

export function PackingItemCard(props: PackingItemCardProps) {
  const isContainer = () => props.item.is_container;
  const hasContents = () =>
    isContainer() && props.containerContentsCount !== undefined && props.containerContentsCount > 0;

  // Detect mobile vs desktop for swipe behavior
  // Check on initial render (before mount) to avoid flash of wrong UI
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  onMount(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    setIsMobile(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handler);
    onCleanup(() => mediaQuery.removeEventListener('change', handler));
  });

  // Check if swipe is enabled (mobile + swipe context provided + not in select mode)
  // Note: Swipe works alongside drag-drop - drag uses the handle, swipe uses the card content
  const swipeEnabled = () =>
    isMobile() &&
    props.revealedItemId !== undefined &&
    props.onRevealChange !== undefined &&
    !props.selectMode;

  // Action buttons component (reused in both layouts)
  const ActionButtons = () => (
    <div class="flex items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleSkipped();
          // Close swipe actions after action
          props.onRevealChange?.(null);
        }}
        class={`p-2 transition-colors ${props.item.is_skipped ? 'text-orange-500 hover:text-orange-600' : 'text-gray-400 hover:text-orange-500'}`}
        aria-label={props.item.is_skipped ? 'Unskip item' : 'Skip item'}
        title={
          props.item.is_skipped ? 'Unskip (need this item)' : 'Skip (not needed for this trip)'
        }
      >
        <SkipIcon class="h-5 w-5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onEdit();
          // Close swipe actions after action
          props.onRevealChange?.(null);
        }}
        class="p-2 text-gray-400 transition-colors hover:text-blue-600"
        aria-label="Edit item"
      >
        <EditIcon class="h-5 w-5" />
      </button>
    </div>
  );

  // Swipe action buttons (styled for revealed panel)
  const SwipeActions = () => (
    <div class="flex h-full items-stretch">
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleSkipped();
          props.onRevealChange?.(null);
        }}
        class={`flex w-[60px] items-center justify-center transition-colors ${
          props.item.is_skipped ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'
        }`}
        aria-label={props.item.is_skipped ? 'Unskip item' : 'Skip item'}
      >
        <SkipIcon class="h-6 w-6" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onEdit();
          props.onRevealChange?.(null);
        }}
        class="flex w-[60px] items-center justify-center bg-blue-500 text-white transition-colors"
        aria-label="Edit item"
      >
        <EditIcon class="h-6 w-6" />
      </button>
    </div>
  );

  // Core card content (without action buttons)
  const CardContent = () => (
    <div
      id={`trip-item-${props.item.id}`}
      data-trip-item-id={props.item.id}
      class={`flex items-center gap-4 rounded-lg p-4 shadow-sm md:gap-2 md:p-2 ${
        isContainer() ? 'border border-blue-200 bg-blue-50' : 'bg-white'
      } ${props.item.is_skipped ? 'bg-gray-100 opacity-50' : ''} ${props.item.is_packed && !props.item.is_skipped ? 'opacity-60' : ''} ${props.selectMode && props.isSelected ? 'ring-2 ring-blue-500' : ''} ${props.isDragging ? 'opacity-50' : ''}`}
    >
      {/* Drag handle - only shown when drag is enabled */}
      <Show when={props.dragActivators}>
        <div
          class="flex cursor-grab items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
          style={{ 'touch-action': 'none' }}
          {...props.dragActivators}
        >
          <DragHandleIcon class="h-5 w-5" />
        </div>
      </Show>
      <Show when={!props.selectMode}>
        <input
          type="checkbox"
          id={`pack-checkbox-${props.item.id}`}
          checked={props.item.is_packed}
          aria-checked={props.item.is_packed ? 'true' : 'false'}
          onChange={props.onTogglePacked}
          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 md:h-6 md:w-6"
          title={isContainer() ? 'Mark container as packed (in bag)' : 'Mark item as packed'}
          aria-label={`Pack ${props.item.name}`}
        />
      </Show>
      <div
        class={`min-w-0 flex-1 ${hasContents() && props.onContainerClick ? 'cursor-pointer' : ''}`}
        onClick={() => hasContents() && props.onContainerClick?.()}
      >
        <div class="flex min-w-0 items-center gap-2">
          <Show when={isContainer()}>
            <span class="flex-shrink-0 text-lg md:text-base" title="Container (sub-bag)">
              {props.categoryIcon || '📦'}
            </span>
          </Show>
          <div
            class={`min-w-0 flex-1 overflow-hidden text-lg font-medium text-ellipsis whitespace-nowrap md:text-base ${props.item.is_skipped ? 'text-gray-400 italic' : props.item.is_packed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
          >
            {props.item.name}
            <Show when={props.item.is_skipped}>
              <span class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-500 not-italic">
                Skipped
              </span>
            </Show>
            <Show when={props.item.notes}>
              <span class="ml-2 text-xs font-normal text-gray-500 not-italic">
                {props.item.notes}
              </span>
            </Show>
          </div>
          <Show when={hasContents()}>
            <span
              class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                props.containerPackedCount === props.containerContentsCount
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {props.containerPackedCount}/{props.containerContentsCount}
            </span>
          </Show>
        </div>
        <div class="mt-1 flex gap-3 text-sm text-gray-500 md:mt-0.5 md:gap-2 md:text-xs">
          {props.showBagInfo && props.bag && <span>👜 {props.bag.name}</span>}
          {props.showCategoryInfo && props.item.category_name && (
            <span>📁 {props.item.category_name}</span>
          )}
          {props.item.quantity > 1 && <span>×{props.item.quantity}</span>}
          <Show when={hasContents() && props.onContainerClick}>
            <span class="text-blue-600">view contents →</span>
          </Show>
        </div>
      </div>
      {/* Desktop: always show buttons. Mobile without swipe: show buttons. Mobile with swipe: hide buttons (revealed by swipe) */}
      <Show
        when={props.selectMode}
        fallback={
          <Show when={!swipeEnabled()}>
            <ActionButtons />
          </Show>
        }
      >
        <input
          type="checkbox"
          id={`select-checkbox-${props.item.id}`}
          checked={props.isSelected}
          aria-checked={props.isSelected ? 'true' : 'false'}
          onChange={props.onToggleSelection}
          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          aria-label={`Select ${props.item.name}`}
        />
      </Show>
    </div>
  );

  // Render with or without swipe wrapper
  return (
    <Show when={swipeEnabled()} fallback={<CardContent />}>
      <SwipeToReveal
        itemId={props.item.id}
        revealedItemId={props.revealedItemId!}
        onRevealChange={props.onRevealChange!}
        actionsWidth={120}
        actions={<SwipeActions />}
      >
        <CardContent />
      </SwipeToReveal>
    </Show>
  );
}
