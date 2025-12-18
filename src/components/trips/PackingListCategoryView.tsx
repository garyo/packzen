/**
 * PackingListCategoryView Component
 *
 * Displays packing list grouped by categories, then by bags
 * Extracted from PackingPage for better separation of concerns
 */

import { For, Show, type Accessor } from 'solid-js';
import type { TripItem, Bag, Category } from '../../lib/types';
import { PackingItemCard } from './PackingItemCard';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';

interface PackingListCategoryViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
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

    // Separate containers from regular items
    const containers = allItems.filter((item) => item.is_container);
    const regularItems = allItems.filter((item) => !item.is_container);

    // Group regular items (not in containers) by category, then by bag_id
    const bagGrouped = new Map<string, Map<string | null, TripItem[]>>();
    regularItems
      .filter((item) => !item.container_item_id) // Exclude items in containers
      .forEach((item) => {
        const category = item.category_name || 'Uncategorized';
        const bagId = item.bag_id || null;

        if (!bagGrouped.has(category)) {
          bagGrouped.set(category, new Map());
        }

        const categoryBags = bagGrouped.get(category)!;
        if (!categoryBags.has(bagId)) {
          categoryBags.set(bagId, []);
        }

        categoryBags.get(bagId)!.push(item);
      });

    // Group contained items by category, then by container
    // Filter out zombie containers (items pointing to deleted containers)
    const containerIds = new Set(containers.map((c) => c.id));
    const containerGrouped = new Map<string, Map<string, TripItem[]>>();
    regularItems
      .filter((item) => item.container_item_id && containerIds.has(item.container_item_id)) // Only items in valid containers
      .forEach((item) => {
        const category = item.category_name || 'Uncategorized';
        const containerId = item.container_item_id!;

        if (!containerGrouped.has(category)) {
          containerGrouped.set(category, new Map());
        }

        const categoryContainers = containerGrouped.get(category)!;
        if (!categoryContainers.has(containerId)) {
          categoryContainers.set(containerId, []);
        }

        categoryContainers.get(containerId)!.push(item);
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

    return { bagGrouped, containerGrouped, allBags: bagsWithWearing, containers };
  };

  // Get category icon by name
  const getCategoryIcon = (categoryName: string) => {
    const allCategories = props.categories() || [];
    const category = allCategories.find((c) => c.name === categoryName);
    return category?.icon || '📦';
  };

  // Sort categories alphabetically - combine categories from both bags and containers
  const sortedCategories = () => {
    const allCategories = new Set<string>();
    itemsByCategory().bagGrouped.forEach((_, category) => allCategories.add(category));
    itemsByCategory().containerGrouped.forEach((_, category) => allCategories.add(category));
    return Array.from(allCategories).sort((a, b) => a.localeCompare(b));
  };

  return (
    <div class="space-y-6 md:space-y-3">
      <For each={sortedCategories()}>
        {(category) => {
          const categoryBags = () => itemsByCategory().bagGrouped.get(category) || new Map();
          const categoryContainers = () =>
            itemsByCategory().containerGrouped.get(category) || new Map();

          const totalBagItems = () =>
            Array.from(categoryBags().values()).reduce((sum, items) => sum + items.length, 0);
          const totalContainerItems = () =>
            Array.from(categoryContainers().values()).reduce((sum, items) => sum + items.length, 0);
          const totalItems = () => totalBagItems() + totalContainerItems();

          // Sort bags alphabetically within category
          const sortedBags = () => {
            return Array.from(categoryBags().entries()).sort(([bagIdA], [bagIdB]) => {
              const bagA = itemsByCategory().allBags.find((b) => b.id === bagIdA);
              const bagB = itemsByCategory().allBags.find((b) => b.id === bagIdB);
              return (bagA?.name || '').localeCompare(bagB?.name || '');
            });
          };

          // Sort containers alphabetically within category
          const sortedContainers = () => {
            return Array.from(categoryContainers().entries()).sort(
              ([containerIdA], [containerIdB]) => {
                const containerA = itemsByCategory().containers.find((c) => c.id === containerIdA);
                const containerB = itemsByCategory().containers.find((c) => c.id === containerIdB);
                return (containerA?.name || '').localeCompare(containerB?.name || '');
              }
            );
          };

          const categoryIcon = getCategoryIcon(category);

          return (
            <Show when={totalItems() > 0}>
              <div>
                <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                  <span class="text-xl md:text-lg">{categoryIcon}</span>
                  <h2 class="text-lg font-semibold text-gray-900 md:text-base">{category}</h2>
                  <span class="text-sm text-gray-500 md:text-xs">({totalItems()})</span>
                </div>

                {/* Bag sections */}
                <For each={sortedBags()}>
                  {([bagId, bagItems]) => {
                    const bag = () => itemsByCategory().allBags.find((b) => b.id === bagId);
                    // Sort items alphabetically by name
                    const sortedItems = [...bagItems].sort((a, b) => a.name.localeCompare(b.name));
                    return (
                      <div class="mb-4 md:mb-2">
                        <h3 class="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs">
                          <Show
                            when={bag()?.id !== null}
                            fallback={<span class="text-base md:text-sm">👕</span>}
                          >
                            <div
                              class={`h-2.5 w-2.5 rounded-full md:h-2 md:w-2 ${getBagColorClass(bag()?.color)}`}
                              style={getBagColorStyle(bag()?.color)}
                            />
                          </Show>
                          {bag()?.name || 'No bag'}
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

                {/* Container sections */}
                <For each={sortedContainers()}>
                  {([containerId, containerItems]) => {
                    const container = () =>
                      itemsByCategory().containers.find((c) => c.id === containerId);
                    const containerBag = () => {
                      const cont = container();
                      if (!cont?.bag_id) return null;
                      return itemsByCategory().allBags.find((b) => b.id === cont.bag_id);
                    };
                    const containerIcon = () => {
                      const cont = container();
                      return cont?.category_name ? getCategoryIcon(cont.category_name) : '📦';
                    };
                    // Sort items alphabetically by name
                    const sortedItems = [...containerItems].sort((a, b) =>
                      a.name.localeCompare(b.name)
                    );
                    return (
                      <div class="mb-4 md:mb-2">
                        <h3 class="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-blue-700 md:mb-1 md:text-xs">
                          <span class="text-base md:text-sm">{containerIcon()}</span>
                          {container()?.name || 'Container'}
                          <Show when={containerBag()}>
                            <span class="text-xs text-gray-500">in {containerBag()!.name}</span>
                          </Show>
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
                                showBagInfo={false}
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
