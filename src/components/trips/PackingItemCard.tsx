/**
 * PackingItemCard Component
 *
 * Reusable item card for packing lists
 * Extracted from PackingPage to reduce code duplication
 */

import { Show } from 'solid-js';
import type { TripItem, Bag } from '../../lib/types';

interface PackingItemCardProps {
  item: TripItem;
  selectMode: boolean;
  isSelected: boolean;
  bag?: Bag | null;
  showBagInfo?: boolean;
  showCategoryInfo?: boolean;
  onTogglePacked: () => void;
  onEdit: () => void;
  onToggleSelection: () => void;
}

export function PackingItemCard(props: PackingItemCardProps) {
  return (
    <div
      class={`flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm md:gap-2 md:p-2 ${props.item.is_packed ? 'opacity-60' : ''} ${props.selectMode && props.isSelected ? 'ring-2 ring-blue-500' : ''} `}
    >
      <Show when={!props.selectMode}>
        <input
          type="checkbox"
          checked={props.item.is_packed}
          onChange={props.onTogglePacked}
          class="h-8 w-8 cursor-pointer rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 md:h-6 md:w-6"
        />
      </Show>
      <div class="flex-1">
        <p
          class={`text-lg font-medium md:text-base ${props.item.is_packed ? 'text-gray-500 line-through' : 'text-gray-900'}`}
        >
          {props.item.name}
        </p>
        <div class="mt-1 flex gap-3 text-sm text-gray-500 md:mt-0.5 md:gap-2 md:text-xs">
          {props.showBagInfo && props.bag && <span>👜 {props.bag.name}</span>}
          {props.showCategoryInfo && props.item.category_name && (
            <span>📁 {props.item.category_name}</span>
          )}
          {props.item.quantity > 1 && <span>×{props.item.quantity}</span>}
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
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
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
