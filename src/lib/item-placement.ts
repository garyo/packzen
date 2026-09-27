/**
 * Where each trip item is shown: loose in a bag, or inside a container.
 * Shared by the packing list views and Add mode so they always agree.
 */
import type { Bag, TripItem } from './types';

export interface ItemPlacement {
  /** Items not in a container (containers included), keyed by bag id; null = not in a bag. */
  byBag: Map<string | null, TripItem[]>;
  /** Contents of each container that exists, keyed by container id. */
  byContainer: Map<string, TripItem[]>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Group items by bag and by container. An item whose bag no longer exists
 * (e.g. deleted on another device, before the next refresh) is treated as
 * not in a bag. Contents of a missing container aren't placed anywhere.
 */
export function placeItems(items: readonly TripItem[], bags: readonly Bag[]): ItemPlacement {
  const bagIds = new Set(bags.map((bag) => bag.id));
  const containerIds = new Set(items.filter((i) => i.is_container).map((i) => i.id));
  const byBag = new Map<string | null, TripItem[]>();
  const byContainer = new Map<string, TripItem[]>();

  for (const item of items) {
    if (item.container_item_id) {
      if (containerIds.has(item.container_item_id)) {
        push(byContainer, item.container_item_id, item);
      }
    } else {
      push(byBag, item.bag_id && bagIds.has(item.bag_id) ? item.bag_id : null, item);
    }
  }
  return { byBag, byContainer };
}

/** Group items by a key, returning [key, items] pairs sorted by key. */
export function groupSorted<T>(items: readonly T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) push(groups, keyOf(item), item);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export const categoryOf = (item: Pick<TripItem, 'category_name'>) =>
  item.category_name || 'Uncategorized';
