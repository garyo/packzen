/**
 * Adds items from My Items or Suggestions to a trip, creating the My Items
 * and categories they need along the way.
 */
import { api, endpoints } from './api';
import type { Category, MasterItemWithCategory, SelectedBuiltInItem } from './types';
import type { TripItemsStore } from './trip-items-store';
import { getOrCreateCategory, resolveMasterItems } from './item-helpers';
import { showToast } from '../components/ui/Toast';

export const itemCount = (n: number) => (n === 1 ? '1 item' : `${n} items`);

/** A page's copy of a list, which the adder updates with what it creates. */
interface SharedList<T> {
  get: () => T[] | undefined;
  set: (list: T[]) => void;
}

/** A copy of the list if it's loaded, or a fresh fetch; null if it can't be loaded. */
async function loadList<T>(list: SharedList<T>, endpoint: string): Promise<T[] | null> {
  const current = list.get();
  if (current?.length) return [...current];
  const response = await api.get<T[]>(endpoint);
  return response.success ? (response.data ?? []) : null;
}

export function createTripItemAdder(
  store: TripItemsStore,
  library: { categories: SharedList<Category>; masterItems: SharedList<MasterItemWithCategory> }
) {
  /** Create any of these categories that don't exist yet, with built-in icons. */
  async function ensureCategories(names: string[]) {
    const categories = await loadList(library.categories, endpoints.categories);
    if (!categories) return;
    for (const name of names) await getOrCreateCategory(name, categories);
    library.categories.set(categories);
  }

  async function addNow(
    selected: SelectedBuiltInItem[],
    bagId: string | null,
    containerId: string | null
  ) {
    // The server skips names already on the trip; skip them here too, so
    // they don't become My Items either.
    const taken = new Set((store.items() ?? []).map((item) => item.name.toLowerCase()));
    const toAdd = selected.filter((item) => {
      const key = item.name.toLowerCase();
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    });
    if (toAdd.length === 0) {
      showToast('info', 'Those items are already on your list');
      return;
    }

    const [masterItems, categories] = await Promise.all([
      loadList(library.masterItems, endpoints.masterItems),
      loadList(library.categories, endpoints.categories),
    ]);
    if (!masterItems || !categories) {
      showToast('error', 'Failed to load My Items');
      return;
    }
    const resolved = await resolveMasterItems(toAdd, masterItems, categories);
    library.masterItems.set(masterItems);
    library.categories.set(categories);

    // Containers can't nest: one added to a container goes into that container's bag.
    const containerBagId = containerId ? (store.find(containerId)?.bag_id ?? null) : null;
    const added = await store.addItems(
      toAdd.map((item, i) => {
        const nested = !!containerId && !item.is_container;
        return {
          name: item.name,
          category_name: item.category,
          quantity: item.quantity,
          notes: item.description,
          bag_id: nested ? null : containerId ? containerBagId : bagId,
          container_item_id: nested ? containerId : null,
          master_item_id: resolved[i].item?.id ?? null,
          is_container: item.is_container ?? false,
        };
      })
    );
    if (!added) return;
    if (added.length < toAdd.length) {
      showToast(
        'info',
        `Added ${added.length} of ${toAdd.length} items; the rest are over your plan's item limit`
      );
    } else {
      showToast(
        'success',
        added.length === 1 ? `Added ${added[0].name}` : `Added ${itemCount(added.length)}`
      );
    }
  }

  // Adds run one at a time, so each sees the categories and My Items the
  // previous one created, and a double-tapped "Add all" adds once.
  let queue = Promise.resolve();
  const addItems = (
    selected: SelectedBuiltInItem[],
    bagId: string | null,
    containerId: string | null
  ) => (queue = queue.then(() => addNow(selected, bagId, containerId)));

  return { addItems, ensureCategories };
}
