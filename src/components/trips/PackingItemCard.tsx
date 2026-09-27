/**
 * One row of the packing list: tap anywhere on it to pack (or, in select
 * mode, select) the item; "⋯" opens its actions.
 */

import { Show } from 'solid-js';
import type { TripItem } from '../../lib/types';
import type { PackingStats } from '../../lib/packing-stats';
import { DragHandleIcon } from '../ui/Icons';

type DragActivators = Record<string, (event: Event) => void>;

interface PackingItemCardProps {
  item: TripItem;
  selectMode: boolean;
  isSelected: boolean;
  /** Icon for the item's category (shown for containers). */
  categoryIcon?: string;
  onTogglePacked: () => void;
  onToggleSelection: () => void;
  onOpenActions: () => void;
  /** Progress of the items inside, if this is a container. */
  containerStats?: PackingStats;
  /** Scroll to the container's own section. */
  onContainerClick?: () => void;
  dragActivators?: DragActivators;
  isDragging?: boolean;
}

export function PackingItemCard(props: PackingItemCardProps) {
  const checkboxId = () => `${props.selectMode ? 'select' : 'pack'}-checkbox-${props.item.id}`;
  const hasContents = () =>
    !!props.containerStats && props.containerStats.total + props.containerStats.skipped > 0;

  return (
    <div
      id={`trip-item-${props.item.id}`}
      data-trip-item-id={props.item.id}
      class="flex min-h-12 items-center rounded-lg pl-2 shadow-sm md:min-h-10"
      classList={{
        'border border-blue-200 bg-blue-50': props.item.is_container,
        'bg-white': !props.item.is_container && !props.item.is_skipped,
        'bg-gray-100 opacity-60': props.item.is_skipped,
        'opacity-60': props.item.is_packed,
        'ring-2 ring-blue-500': props.selectMode && props.isSelected,
        'opacity-40': props.isDragging,
      }}
    >
      <Show when={props.dragActivators}>
        <div
          class="hidden cursor-grab items-center text-gray-400 hover:text-gray-600 active:cursor-grabbing md:flex"
          style={{ 'touch-action': 'none' }}
          aria-hidden="true"
          {...props.dragActivators}
        >
          <DragHandleIcon class="h-5 w-5" />
        </div>
      </Show>

      <label
        for={checkboxId()}
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2"
      >
        <Show
          when={props.selectMode}
          fallback={
            <input
              type="checkbox"
              id={checkboxId()}
              checked={props.item.is_packed}
              onChange={props.onTogglePacked}
              class="btn-compact h-6 w-6 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
              aria-label={`Pack ${props.item.name}`}
            />
          }
        >
          <input
            type="checkbox"
            id={checkboxId()}
            checked={props.isSelected}
            onChange={props.onToggleSelection}
            class="btn-compact h-6 w-6 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            aria-label={`Select ${props.item.name}`}
          />
        </Show>

        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-1.5">
            <Show when={props.item.is_container}>
              <span class="flex-shrink-0" title="Container">
                {props.categoryIcon || '📦'}
              </span>
            </Show>
            <span
              class="line-clamp-2 min-w-0 font-medium break-words md:text-sm"
              classList={{
                'text-gray-400 italic': props.item.is_skipped,
                'text-gray-500 line-through': props.item.is_packed && !props.item.is_skipped,
                'text-gray-900': !props.item.is_packed && !props.item.is_skipped,
              }}
            >
              {props.item.name}
            </span>
            <Show when={props.item.quantity > 1}>
              <span class="flex-shrink-0 rounded bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
                ×{props.item.quantity}
              </span>
            </Show>
            <Show when={props.item.is_skipped}>
              <span class="flex-shrink-0 rounded bg-gray-200 px-1.5 text-xs text-gray-500 not-italic">
                Skipped
              </span>
            </Show>
          </span>
          <Show when={props.item.notes}>
            <span class="hidden truncate text-xs text-gray-400 md:block">{props.item.notes}</span>
          </Show>
        </span>
      </label>

      <Show when={hasContents() && props.containerStats}>
        {(stats) => (
          <button
            type="button"
            onClick={() => props.onContainerClick?.()}
            disabled={!props.onContainerClick}
            class="btn-compact flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            classList={{
              'bg-green-100 text-green-700': stats().remaining === 0,
              'bg-blue-100 text-blue-700': stats().remaining > 0,
            }}
            title="Show what's inside"
          >
            {stats().packed}/{stats().total}
            <Show when={props.onContainerClick}> ↓</Show>
          </button>
        )}
      </Show>

      <Show when={!props.selectMode}>
        <button
          type="button"
          onClick={props.onOpenActions}
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={`Actions for ${props.item.name}`}
          title="Move, skip, edit or delete"
        >
          ⋯
        </button>
      </Show>
    </div>
  );
}
