/**
 * PackingListCategoryView Component
 *
 * Packing list grouped by category, then by bag or container. Items can be
 * dragged between bags and containers within their category.
 */

import { For, Show, createMemo } from 'solid-js';
import type { TripItem } from '../../lib/types';
import { packingStats } from '../../lib/packing-stats';
import { byName, categoryOf, placeItems } from '../../lib/item-placement';
import { getBagColorClass, getBagColorStyle } from '../../lib/color-utils';
import {
  AllPackedNote,
  ItemGroup,
  NO_BAG,
  PackDnd,
  createCardRenderer,
  createCategoryIcons,
  dropInto,
  type PackingListProps,
} from './PackingListParts';

interface CategorySection {
  items: TripItem[];
  byBag: Map<string | null, TripItem[]>;
  byContainer: Map<string, TripItem[]>;
}

const GROUP_TITLE_CLASS =
  'mb-2 flex items-center gap-1.5 px-1 text-sm font-medium md:mb-1 md:text-xs';

export function PackingListCategoryView(props: PackingListProps) {
  const placement = createMemo(() => placeItems(props.items() ?? [], props.bags() ?? []));
  const iconFor = createCategoryIcons(props.categories);
  const contentsOf = (containerId: string) => placement().byContainer.get(containerId) ?? [];
  const renderCard = createCardRenderer(props, iconFor, contentsOf);

  const bagsById = createMemo(() => new Map((props.bags() ?? []).map((bag) => [bag.id, bag])));
  const containersById = createMemo(
    () => new Map((props.items() ?? []).filter((i) => i.is_container).map((i) => [i.id, i]))
  );

  // Keyed by category, in category order.
  const sections = createMemo(() => {
    const byCategory = new Map<string, CategorySection>();
    const section = (item: TripItem) => {
      const category = categoryOf(item);
      let entry = byCategory.get(category);
      if (!entry) {
        entry = { items: [], byBag: new Map(), byContainer: new Map() };
        byCategory.set(category, entry);
      }
      entry.items.push(item);
      return entry;
    };
    const add = <K,>(map: Map<K, TripItem[]>, key: K, item: TripItem) =>
      map.set(key, [...(map.get(key) ?? []), item]);

    for (const [bagId, items] of placement().byBag) {
      for (const item of items) add(section(item).byBag, bagId, item);
    }
    for (const [containerId, items] of placement().byContainer) {
      for (const item of items) add(section(item).byContainer, containerId, item);
    }
    return new Map([...byCategory].sort(([a], [b]) => a.localeCompare(b)));
  });

  // Bags by name, with "not in a bag" last; containers by name.
  const sortedBagIds = (byBag: Map<string | null, TripItem[]>) =>
    [...byBag.keys()].sort((a, b) =>
      a === null ? 1 : b === null ? -1 : byName(bagsById().get(a)!, bagsById().get(b)!)
    );
  const sortedContainerIds = (byContainer: Map<string, TripItem[]>) =>
    [...byContainer.keys()].sort((a, b) =>
      byName(containersById().get(a)!, containersById().get(b)!)
    );

  const sortedItems = (items: TripItem[] | undefined) => [...(items ?? [])].sort(byName);

  return (
    <PackDnd
      onDrop={(item, target) => {
        // Only moves within the item's own category are allowed here.
        if (target.category === categoryOf(item)) dropInto(props, item, target);
      }}
    >
      <div class="space-y-6 md:space-y-3">
        <For each={[...sections().keys()]}>
          {(category) => {
            const section = () => sections().get(category)!;
            const stats = () => packingStats(section().items);
            const allPacked = () =>
              props.showUnpackedOnly() && stats().remaining === 0 && stats().packed > 0;
            const accepts = (item: TripItem) => categoryOf(item) === category;
            return (
              <div>
                <div class="mb-3 flex items-center gap-2 md:mb-1.5">
                  <span class="text-xl md:text-lg">{iconFor(category)}</span>
                  <h2 class="text-lg font-semibold text-gray-900 md:text-base">{category}</h2>
                  <span class="text-sm text-gray-500 md:text-xs">({section().items.length})</span>
                </div>

                <Show when={!allPacked()} fallback={<AllPackedNote count={stats().total} />}>
                  <For each={sortedBagIds(section().byBag)}>
                    {(bagId) => {
                      const bag = () => (bagId ? bagsById().get(bagId)! : NO_BAG);
                      return (
                        <ItemGroup
                          items={sortedItems(section().byBag.get(bagId))}
                          showUnpackedOnly={props.showUnpackedOnly()}
                          renderCard={renderCard}
                          class="mb-4 md:mb-2"
                          titleClass={`${GROUP_TITLE_CLASS} text-gray-600`}
                          dropZone={{
                            id: `category-${category}-bag-${bagId ?? 'none'}`,
                            data: { type: 'bag', bagId, category },
                            activeClass: 'bg-blue-50 ring-2 ring-blue-400',
                            accepts,
                          }}
                          title={
                            <>
                              <Show
                                when={bagId !== null}
                                fallback={<span class="text-base md:text-sm">👕</span>}
                              >
                                <div
                                  class={`h-2.5 w-2.5 rounded-full border border-gray-300 md:h-2 md:w-2 ${getBagColorClass(bag().color)}`}
                                  style={getBagColorStyle(bag().color)}
                                />
                              </Show>
                              {bag().name}
                            </>
                          }
                        />
                      );
                    }}
                  </For>

                  <For each={sortedContainerIds(section().byContainer)}>
                    {(containerId) => {
                      const container = () => containersById().get(containerId)!;
                      const containerBag = () => bagsById().get(container().bag_id ?? '');
                      return (
                        <ItemGroup
                          items={sortedItems(section().byContainer.get(containerId))}
                          showUnpackedOnly={props.showUnpackedOnly()}
                          renderCard={renderCard}
                          class="mb-4 md:mb-2"
                          titleClass={`${GROUP_TITLE_CLASS} text-blue-700`}
                          dropZone={{
                            id: `category-${category}-container-${containerId}`,
                            data: { type: 'container', containerId, category },
                            activeClass: 'bg-purple-50 ring-2 ring-purple-400',
                            accepts,
                          }}
                          title={
                            <>
                              <span class="text-base md:text-sm">
                                {iconFor(container().category_name)}
                              </span>
                              {container().name}
                              <Show when={containerBag()}>
                                {(bag) => (
                                  <span class="text-xs text-gray-500">in {bag().name}</span>
                                )}
                              </Show>
                            </>
                          }
                        />
                      );
                    }}
                  </For>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </PackDnd>
  );
}
