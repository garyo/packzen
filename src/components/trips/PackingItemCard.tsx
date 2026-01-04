/**
 * PackingItemCard Component
 *
 * Reusable item card for packing lists
 * Extracted from PackingPage to reduce code duplication
 */

import { Show, type JSX } from 'solid-js';
import type { TripItem, Bag } from '../../lib/types';
import { DragHandleIcon, EditIcon } from '../ui/Icons';

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
  onEdit: () => void;
  onToggleSelection: () => void;
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

  return (
    <div
      id={`trip-item-${props.item.id}`}
      data-trip-item-id={props.item.id}
      class={`flex items-center gap-4 rounded-lg p-4 shadow-sm md:gap-2 md:p-2 ${
        isContainer() ? 'border border-blue-200 bg-blue-50' : 'bg-white'
      } ${props.item.is_packed ? 'opacity-60' : ''} ${props.selectMode && props.isSelected ? 'ring-2 ring-blue-500' : ''} ${props.isDragging ? 'opacity-50' : ''}`}
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
          checked={props.item.is_packed}
          onChange={props.onTogglePacked}
          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 md:h-6 md:w-6"
          title={isContainer() ? 'Mark container as packed (in bag)' : 'Mark item as packed'}
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
            class={`min-w-0 flex-1 overflow-hidden text-lg font-medium text-ellipsis whitespace-nowrap md:text-base ${props.item.is_packed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
          >
            {props.item.name}
            <Show when={props.item.notes}>
              <span class="ml-2 text-xs font-normal text-gray-500">{props.item.notes}</span>
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
      <Show
        when={props.selectMode}
        fallback={
          <button
            onClick={props.onEdit}
            class="p-2 text-gray-400 transition-colors hover:text-blue-600"
            aria-label="Edit item"
          >
            <EditIcon class="h-5 w-5" />
          </button>
        }
      >
        <input
          type="checkbox"
          checked={props.isSelected}
          onChange={props.onToggleSelection}
          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
      </Show>
    </div>
  );
}
