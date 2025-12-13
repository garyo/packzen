/**
 * ItemsList Component
 *
 * Displays master items organized by category and uncategorized items
 * Extracted from AllItemsPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { Category, MasterItem } from '../../lib/types';

interface ItemsListProps {
  items: Accessor<MasterItem[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onEditItem: (item: MasterItem) => void;
  onDeleteItem: (id: string) => void;
}

export function ItemsList(props: ItemsListProps) {
  const getItemsByCategory = (categoryId: string | null) => {
    return props.items()?.filter((item) => item.category_id === categoryId) || [];
  };

  const uncategorizedItems = () => getItemsByCategory(null);

  return (
    <div class="space-y-6 md:space-y-3">
      {/* Categories */}
      <For each={props.categories()}>
        {(category) => {
          const categoryItems = () => getItemsByCategory(category.id);
          return (
            <Show when={categoryItems().length > 0}>
              <CategorySection
                category={category}
                items={categoryItems()}
                onEditItem={props.onEditItem}
                onDeleteItem={props.onDeleteItem}
              />
            </Show>
          );
        }}
      </For>

      {/* Uncategorized */}
      <Show when={uncategorizedItems().length > 0}>
        <div class="rounded-lg bg-white p-4 md:p-2 shadow-sm">
          <h2 class="mb-4 md:mb-2 text-lg md:text-base font-semibold text-gray-900">
            Uncategorized ({uncategorizedItems().length})
          </h2>
          <div class="grid grid-cols-1 gap-3 md:gap-2 md:grid-cols-2 lg:grid-cols-3">
            <For each={uncategorizedItems()}>
              {(item) => (
                <ItemCard
                  item={item}
                  onEdit={() => props.onEditItem(item)}
                  onDelete={() => props.onDeleteItem(item.id)}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

interface CategorySectionProps {
  category: Category;
  items: MasterItem[];
  onEditItem: (item: MasterItem) => void;
  onDeleteItem: (id: string) => void;
}

function CategorySection(props: CategorySectionProps) {
  return (
    <div class="rounded-lg bg-white p-4 md:p-2 shadow-sm">
      <div class="mb-4 md:mb-2 flex items-center gap-2">
        <span class="text-2xl md:text-xl">{props.category.icon || '📦'}</span>
        <h2 class="text-lg md:text-base font-semibold text-gray-900">{props.category.name}</h2>
        <span class="text-sm md:text-xs text-gray-500">({props.items.length})</span>
      </div>
      <div class="grid grid-cols-1 gap-3 md:gap-2 md:grid-cols-2 lg:grid-cols-3">
        <For each={props.items}>
          {(item) => (
            <ItemCard
              item={item}
              onEdit={() => props.onEditItem(item)}
              onDelete={() => props.onDeleteItem(item.id)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

interface ItemCardProps {
  item: MasterItem;
  onEdit: () => void;
  onDelete: () => void;
}

function ItemCard(props: ItemCardProps) {
  return (
    <div
      class="rounded-lg border border-gray-200 p-3 md:p-2 transition-colors hover:border-blue-500 cursor-pointer"
      onClick={props.onEdit}
    >
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h3 class="font-medium md:text-sm text-gray-900">{props.item.name}</h3>
          {props.item.description && (
            <p class="mt-1 md:mt-0.5 text-sm md:text-xs text-gray-600">{props.item.description}</p>
          )}
          <p class="mt-1 md:mt-0.5 text-xs text-gray-500">Qty: {props.item.default_quantity}</p>
        </div>
        <div class="ml-2 flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete();
            }}
            class="p-1 text-gray-400 hover:text-red-600"
            aria-label="Delete"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
