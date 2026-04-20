/**
 * PackingItemCard Component
 *
 * Reusable item card for packing lists.
 */

import { Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { TripItem, Bag } from '../../lib/types';
import { DragHandleIcon, EditIcon, SkipIcon } from '../ui/Icons';

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
  // Quantity update
  onUpdateQuantity?: (quantity: number) => void;
  // Container-specific props
  containerContentsCount?: number; // Number of items inside (if this is a container)
  containerPackedCount?: number; // Number of packed items inside (if this is a container)
  onContainerClick?: () => void; // Click handler for navigating to container section
  // Drag-and-drop props
  dragActivators?: DragActivators; // Event handlers for drag handle
  isDragging?: boolean; // Whether this item is currently being dragged
}

export function PackingItemCard(props: PackingItemCardProps) {
  const isContainer = () => props.item.is_container;
  const hasContents = () =>
    isContainer() && props.containerContentsCount !== undefined && props.containerContentsCount > 0;

  // Quantity popover state
  const [showQuantityPopover, setShowQuantityPopover] = createSignal(false);
  const [popoverPos, setPopoverPos] = createSignal({ top: 0, right: 0 });
  let quantityPillRef: HTMLButtonElement | undefined;
  let quantityPopoverRef: HTMLDivElement | undefined;

  const updatePopoverPos = () => {
    if (!quantityPillRef) return;
    const rect = quantityPillRef.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  };

  const openQuantityPopover = () => {
    updatePopoverPos();
    setShowQuantityPopover(true);
  };

  // Click-outside to close popover; also close on scroll/resize to avoid stale position
  createEffect(() => {
    if (!showQuantityPopover()) return;
    const close = (e: MouseEvent) => {
      if (
        quantityPillRef &&
        !quantityPillRef.contains(e.target as Node) &&
        quantityPopoverRef &&
        !quantityPopoverRef.contains(e.target as Node)
      ) {
        setShowQuantityPopover(false);
      }
    };
    const closeOnScroll = () => setShowQuantityPopover(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    onCleanup(() => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    });
  });

  // Action buttons (always visible on both mobile and desktop)
  const ActionButtons = () => (
    <div class="flex items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleSkipped();
        }}
        class={`p-1.5 transition-colors md:p-2 ${props.item.is_skipped ? 'text-orange-500 hover:text-orange-600' : 'text-gray-400 hover:text-orange-500'}`}
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
        }}
        class="p-1.5 text-gray-400 transition-colors hover:text-blue-600 md:p-2"
        aria-label="Edit item"
      >
        <EditIcon class="h-5 w-5" />
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
          <Show when={props.onUpdateQuantity || props.item.quantity > 1}>
            <button
              type="button"
              ref={quantityPillRef}
              onClick={(e) => {
                e.stopPropagation();
                if (props.onUpdateQuantity) {
                  if (showQuantityPopover()) {
                    setShowQuantityPopover(false);
                  } else {
                    openQuantityPopover();
                  }
                }
              }}
              class={`btn-compact flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                props.onUpdateQuantity
                  ? 'cursor-pointer bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              ×{props.item.quantity}
            </button>
            <Show when={showQuantityPopover()}>
              <Portal>
                <div
                  ref={quantityPopoverRef}
                  class="fixed z-50 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-lg"
                  style={{
                    top: `${popoverPos().top}px`,
                    right: `${popoverPos().right}px`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      if (props.item.quantity > 1) {
                        props.onUpdateQuantity?.(props.item.quantity - 1);
                      }
                    }}
                    disabled={props.item.quantity <= 1}
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    -
                  </button>
                  <span class="min-w-[1.5rem] text-center text-sm font-semibold">
                    {props.item.quantity}
                  </span>
                  <button
                    onClick={() => {
                      props.onUpdateQuantity?.(props.item.quantity + 1);
                    }}
                    class="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200"
                  >
                    +
                  </button>
                </div>
              </Portal>
            </Show>
          </Show>
        </div>
        <div class="mt-1 flex gap-3 text-sm text-gray-500 md:mt-0.5 md:gap-2 md:text-xs">
          {props.showBagInfo && props.bag && <span>👜 {props.bag.name}</span>}
          {props.showCategoryInfo && props.item.category_name && (
            <span>📁 {props.item.category_name}</span>
          )}
          {props.item.notes && <span class="text-gray-400">{props.item.notes}</span>}
          <Show when={hasContents() && props.onContainerClick}>
            <span class="text-blue-600">view contents →</span>
          </Show>
        </div>
      </div>
      <Show when={props.selectMode} fallback={<ActionButtons />}>
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

  return <CardContent />;
}
