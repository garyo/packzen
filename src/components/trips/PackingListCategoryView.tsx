/**
 * PackingListCategoryView Component
 *
 * Displays packing list grouped by categories, then by bags
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { TripItem, Bag } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';

interface PackingListCategoryViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  selectMode: Accessor<boolean>;
  selectedItems: Accessor<Set<string>>;
  onTogglePacked: (item: TripItem) => void;
  onEditItem: (item: TripItem) => void;
  onToggleItemSelection: (itemId: string) => void;
}

export function PackingListCategoryView(props: PackingListCategoryViewProps) {
  const itemsByCategory = () => {
    const allItems = props.items() || [];
    const allBags = props.bags() || [];
    const grouped = new Map<string, Map<string | null, TripItem[]>>();

    // Group items by category, then by bag_id
    allItems.forEach((item) => {
      const category = item.category_name || 'Uncategorized';
      const bagId = item.bag_id || null;

      if (!grouped.has(category)) {
        grouped.set(category, new Map());
      }

      const categoryBags = grouped.get(category)!;
      if (!categoryBags.has(bagId)) {
        categoryBags.set(bagId, []);
      }

      categoryBags.get(bagId)!.push(item);
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

  return (
    <div class="space-y-6 md:space-y-3">
      <For each={Array.from(itemsByCategory().grouped.entries())}>
        {([category, categoryBags]) => {
          const totalItems = () =>
            Array.from(categoryBags.values()).reduce((sum, items) => sum + items.length, 0);
          return (
            <Show when={totalItems() > 0}>
              <div>
                <div class="mb-3 md:mb-1.5 flex items-center gap-2">
                  <h2 class="text-lg md:text-base font-semibold text-gray-900">📁 {category}</h2>
                  <span class="text-sm md:text-xs text-gray-500">({totalItems()})</span>
                </div>
                <For each={Array.from(categoryBags.entries())}>
                  {([bagId, bagItems]) => {
                    const bag = () => itemsByCategory().allBags.find((b) => b.id === bagId);
                    return (
                      <div class="mb-4 md:mb-2">
                        <h3 class="mb-2 md:mb-1 px-1 text-sm md:text-xs font-medium text-gray-600">
                          {bag()?.name || 'No bag'}
                        </h3>
                        <div
                          class="grid gap-2 md:gap-1.5"
                          style="grid-template-columns: repeat(auto-fill, minmax(320px, 400px))"
                        >
                          <For each={bagItems}>
                            {(item) => (
                              <PackingItemCard
                                item={item}
                                selectMode={props.selectMode()}
                                isSelected={props.selectedItems().has(item.id)}
                                bag={bag()}
                                showBagInfo={true}
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
