/**
 * SelectModeActionBar Component
 *
 * Bottom action bar for batch operations in select mode
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, createSignal, createMemo, type Accessor } from 'solid-js';
import type { Bag, Category, TripItem } from '../../lib/types';
import { Button } from '../ui/Button';

interface SelectModeActionBarProps {
  selectedCount: Accessor<number>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  containers: Accessor<TripItem[]>;
  onAssignToBag: (bagId: string | null) => void;
  onAssignToContainer: (containerId: string | null) => void;
  onAssignToCategory: (categoryId: string | null) => void;
  onDeleteAll: () => void;
}

export function SelectModeActionBar(props: SelectModeActionBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);

  // Sort categories alphabetically
  const sortedCategories = createMemo(() => {
    const cats = props.categories() || [];
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <div class="fixed right-0 bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-white shadow-lg">
      <div class="container mx-auto px-4 py-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span class="font-medium text-gray-900">
            {props.selectedCount()} item{props.selectedCount() !== 1 ? 's' : ''} selected
          </span>

          <div class="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Assign to Bag */}
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700">Bag:</label>
              <select
                onChange={(e) => props.onAssignToBag(e.target.value || null)}
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose...</option>
                <option value="">No bag</option>
                <For each={props.bags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
              </select>
            </div>

            {/* Assign to Container (only show if containers exist) */}
            <Show when={props.containers().length > 0}>
              <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-gray-700">Container:</label>
                <select
                  onChange={(e) => props.onAssignToContainer(e.target.value || null)}
                  class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose...</option>
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
                onChange={(e) => props.onAssignToCategory(e.target.value || null)}
                class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose...</option>
                <option value="">No category</option>
                <For each={sortedCategories()}>
                  {(category) => <option value={category.id}>{category.name}</option>}
                </For>
              </select>
            </div>

            {/* Delete All Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              class="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Delete All
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Show when={showDeleteConfirm()}>
        <div class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 class="mb-4 text-lg font-semibold text-gray-900">Delete Selected Items?</h3>
            <p class="mb-6 text-sm text-gray-600">
              Are you sure you want to delete {props.selectedCount()} selected item
              {props.selectedCount() !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div class="flex gap-3">
              <Button
                onClick={() => {
                  props.onDeleteAll();
                  setShowDeleteConfirm(false);
                }}
                variant="secondary"
                class="flex-1 justify-center bg-red-50 text-red-600 hover:bg-red-100"
              >
                Delete All
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                variant="secondary"
                class="flex-1 justify-center"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
