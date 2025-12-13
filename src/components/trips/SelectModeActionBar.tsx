/**
 * SelectModeActionBar Component
 *
 * Bottom action bar for batch operations in select mode
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { Bag } from '../../lib/types';

interface SelectModeActionBarProps {
  selectedCount: Accessor<number>;
  bags: Accessor<Bag[] | undefined>;
  onAssignToBag: (bagId: string | null) => void;
}

export function SelectModeActionBar(props: SelectModeActionBarProps) {
  return (
    <div class="fixed right-0 bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-white shadow-lg">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between gap-4">
          <span class="font-medium text-gray-900">
            {props.selectedCount()} item{props.selectedCount() !== 1 ? 's' : ''} selected
          </span>
          <div class="flex items-center gap-3">
            <label class="text-sm font-medium text-gray-700">Assign to:</label>
            <select
              onChange={(e) => props.onAssignToBag(e.target.value || null)}
              class="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a bag...</option>
              <option value="">No bag</option>
              <For each={props.bags()}>
                {(bag) => <option value={bag.id}>{bag.name}</option>}
              </For>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
