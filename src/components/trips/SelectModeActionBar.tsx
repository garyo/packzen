/**
 * SelectModeActionBar Component
 *
 * Bottom action bar for batch operations in select mode
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, createMemo, type Accessor } from 'solid-js';
import type { Bag, Category, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { confirmDialog } from '../ui/ConfirmDialog';

// Distinct sentinel for the "Choose..." placeholder so it never collides with the
// "No bag"/"No container"/"No category" clear option, which uses value="".
const PLACEHOLDER = '__placeholder__';

interface SelectModeActionBarProps {
  selectedCount: Accessor<number>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  containers: Accessor<TripItem[]>;
  onAssignToBag: (bagId: string | null) => void;
  onAssignToContainer: (containerId: string | null) => void;
  onAssignToCategory: (categoryId: string | null) => void;
  onSkipAll: () => void;
  onUnskipAll: () => void;
  onDeleteAll: () => void;
}

export function SelectModeActionBar(props: SelectModeActionBarProps) {
  const itemsLabel = () => `${props.selectedCount()} item${props.selectedCount() !== 1 ? 's' : ''}`;

  const confirmDelete = async () => {
    const confirmed = await confirmDialog({
      title: `Delete ${itemsLabel()}?`,
      message: 'Containers are deleted with their contents. You can undo this afterward.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) props.onDeleteAll();
  };

  // Sort categories alphabetically
  const sortedCategories = createMemo(() => {
    const cats = props.categories() || [];
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <div class="fixed right-0 bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-white shadow-lg">
      <div class="container mx-auto px-4 py-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span class="font-medium text-gray-900">{itemsLabel()} selected</span>

          <div class="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Assign to Bag */}
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700">Bag:</label>
              <select
                onChange={(e) => {
                  if (e.target.value === PLACEHOLDER) return;
                  props.onAssignToBag(e.target.value || null);
                }}
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value={PLACEHOLDER}>Choose...</option>
                <option value="">{NO_BAG_LABEL}</option>
                <For each={props.bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
              </select>
            </div>

            {/* Assign to Container (only show if containers exist) */}
            <Show when={props.containers().length > 0}>
              <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-gray-700">Container:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value === PLACEHOLDER) return;
                    props.onAssignToContainer(e.target.value || null);
                  }}
                  class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value={PLACEHOLDER}>Choose...</option>
                  <option value="">No container</option>
                  <For each={props.containers()}>
                    {(container) => <option value={container.id}>📦 {container.name}</option>}
                  </For>
                </select>
              </div>
            </Show>

            {/* Assign to Category */}
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700">Category:</label>
              <select
                onChange={(e) => {
                  if (e.target.value === PLACEHOLDER) return;
                  props.onAssignToCategory(e.target.value || null);
                }}
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value={PLACEHOLDER}>Choose...</option>
                <option value="">No category</option>
                <For each={sortedCategories()}>
                  {(category) => <option value={category.id}>{category.name}</option>}
                </For>
              </select>
            </div>

            {/* Skip/Unskip Buttons */}
            <button
              onClick={props.onSkipAll}
              class="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-100"
            >
              Skip
            </button>
            <button
              onClick={props.onUnskipAll}
              class="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Unskip
            </button>

            {/* Delete All Button */}
            <button
              onClick={confirmDelete}
              class="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Delete All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
