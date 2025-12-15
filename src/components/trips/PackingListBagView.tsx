/**
 * PackingListBagView Component
 *
 * Displays packing list grouped by bags, then by categories
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { TripItem, Bag, Category } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';

interface PackingListBagViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  selectMode: Accessor<boolean>;
  selectedItems: Accessor<Set<string>>;
  onTogglePacked: (item: TripItem) => void;
  onEditItem: (item: TripItem) => void;
  onToggleItemSelection: (itemId: string) => void;
}

export function PackingListBagView(props: PackingListBagViewProps) {
  const itemsByBag = () => {
    const allItems = props.items() || [];
    const allBags = props.bags() || [];
    const grouped = new Map<string | null, Map<string, TripItem[]>>();

    // Group items by bag_id, then by category
    allItems.forEach((item) => {
      const bagId = item.bag_id || null;
      const category = item.category_name || 'Uncategorized';

      if (!grouped.has(bagId)) {
        grouped.set(bagId, new Map());
      }

      const bagCategories = grouped.get(bagId)!;
      if (!bagCategories.has(category)) {
        bagCategories.set(category, []);
      }

      bagCategories.get(category)!.push(item);
    });

    // Add virtual "Wearing" bag to the list
    const bagsWithWearing = [
      ...allBags,
      {
        id: null as any,
        trip_id: '',
        name: 'Wearing / No Bag',
        type: 'wearing' as any,
        color: null,
        sort_order: 999,
        created_at: new Date(),
      },
    ];

    return { grouped, allBags: bagsWithWearing };
  };

  // Get category icon by name
  const getCategoryIcon = (categoryName: string) => {
    const allCategories = props.categories() || [];
    const category = allCategories.find((c) => c.name === categoryName);
    return category?.icon || '📦';
  };

  // Sort bags alphabetically
  const sortedBags = () => {
    return [...itemsByBag().allBags].sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div class="space-y-6 md:space-y-3">
      <For each={sortedBags()}>
        {(bag) => {
          const bagCategories = () => itemsByBag().grouped.get(bag.id) || new Map();
          const allBagItems = () => Array.from(bagCategories().values()).flat();
          const totalItems = () => allBagItems().length;
          const packedItems = () => allBagItems().filter((item) => item.is_packed).length;
          // Sort categories alphabetically within bag
          const sortedCategories = () => {
            return Array.from(bagCategories().entries()).sort(([a], [b]) => a.localeCompare(b));
          };
          return (
            <Show when={totalItems() > 0}>
              <div>
                <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                  <Show
                    when={bag.id !== null}
                    fallback={<span class="text-lg md:text-base">👕</span>}
                  >
                    <div
                      class={`h-3 w-3 rounded-full md:h-2.5 md:w-2.5 ${getBagColorClass(bag.color)}`}
                      style={getBagColorStyle(bag.color)}
                    />
                  </Show>
                  <h2 class="text-lg font-semibold text-gray-900 md:text-base">{bag.name}</h2>
                  <span class="text-sm text-gray-500 md:text-xs">
                    {packedItems()} / {totalItems()}
                  </span>
                </div>
                <For each={sortedCategories()}>
                  {([category, categoryItems]) => {
                    // Sort items alphabetically by name
                    const sortedItems = [...categoryItems].sort((a, b) =>
                      a.name.localeCompare(b.name)
                    );
                    const categoryIcon = getCategoryIcon(category);
                    return (
                      <div class="mb-4 md:mb-2">
                        <h3 class="mb-2 flex items-center gap-1 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                          <span class="text-base md:text-sm">{categoryIcon}</span>
                          {category}
                        </h3>
                        <div
                          class="grid gap-2 md:gap-1.5"
                          style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                        >
                          <For each={sortedItems}>
                            {(item) => (
                              <PackingItemCard
                                item={item}
                                selectMode={props.selectMode()}
                                isSelected={props.selectedItems().has(item.id)}
                                showCategoryInfo={true}
                                onTogglePacked={() => props.onTogglePacked(item)}
                                onEdit={() => props.onEditItem(item)}
                                onToggleSelection={() => props.onToggleItemSelection(item.id)}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          );
        }}
      </For>
    </div>
  );
}
