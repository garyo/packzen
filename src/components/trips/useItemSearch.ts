import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { Bag, TripItem } from '../../lib/types';

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Search for the packing page. Matches item names, categories, notes, and the
 * names of an item's bag or container; a match inside a container keeps the
 * container visible too. Filtering is debounced; `results` is undefined until
 * items load.
 */
export function useItemSearch(
  items: Accessor<TripItem[] | undefined>,
  bags: Accessor<Bag[] | undefined>
) {
  const [query, setQuery] = createSignal('');
  const [debouncedQuery, setDebouncedQuery] = createSignal('');
  const [scrollTarget, setScrollTarget] = createSignal<string | null>(null);

  createEffect(() => {
    const value = query();
    const timeoutId = setTimeout(() => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS);
    onCleanup(() => clearTimeout(timeoutId));
  });

  const results = createMemo(() => {
    const allItems = items();
    const needle = debouncedQuery().trim().toLowerCase();
    if (!allItems || !needle) return allItems;

    const containerNames = new Map(
      allItems.filter((item) => item.is_container).map((item) => [item.id, item.name])
    );
    const bagNames = new Map((bags() ?? []).map((bag) => [bag.id, bag.name]));
    const matches = new Set<string>();

    for (const item of allItems) {
      const fields = [
        item.name,
        item.category_name,
        item.notes,
        item.container_item_id && containerNames.get(item.container_item_id),
        item.bag_id && bagNames.get(item.bag_id),
      ];
      if (fields.some((field) => field?.toLowerCase().includes(needle))) {
        matches.add(item.id);
        if (item.container_item_id) matches.add(item.container_item_id);
      }
    }
    return allItems.filter((item) => matches.has(item.id));
  });

  const isSearching = () => query().trim().length > 0;
  const noResults = () => isSearching() && (results()?.length ?? 0) === 0;

  // Once search closes (e.g. by tapping a result), scroll to the chosen item.
  createEffect(() => {
    const itemId = scrollTarget();
    if (!itemId || isSearching()) return;
    requestAnimationFrame(() => {
      document
        .getElementById(`trip-item-${itemId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollTarget(null);
    });
  });

  return { query, setQuery, results, isSearching, noResults, scrollToItem: setScrollTarget };
}
