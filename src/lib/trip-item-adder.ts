/**
 * Adds items from My Items, Suggestions or a starter list to a trip, creating
 * the My Items and categories they need along the way.
 */
import { api, endpoints } from './api';
import type {
  BuiltInItem,
  Category,
  MasterItemWithCategory,
  SelectedBuiltInItem,
  TripItem,
} from './types';
import type { TripItemsStore } from './trip-items-store';
import { getOrCreateCategory, resolveMasterItems } from './item-helpers';
import { getStarterItems, getStarterQuantity, type StarterModifier } from './built-in-items';
import { showToast } from '../components/ui/Toast';

export const itemCount = (n: number) => (n === 1 ? '1 item' : `${n} items`);

const TOILETRY_CATEGORY = 'Toiletries';
const TOILET_KIT = 'Toilet Kit';
const isToiletry = (item: BuiltInItem) => item.category === TOILETRY_CATEGORY && !item.is_container;

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

export interface AddOptions {
  /** Skip the success toast, e.g. when the tapped row already shows the result. */
  quiet?: boolean;
}

export function createTripItemAdder(
  store: TripItemsStore,
  library: { categories: SharedList<Category>; masterItems: SharedList<MasterItemWithCategory> }
) {
  /** Names already on the trip, lowercased. */
  const namesOnTrip = () => new Set((store.items() ?? []).map((item) => item.name.toLowerCase()));

  /** Create any of these categories that don't exist yet, with built-in icons. */
  async function ensureCategories(names: string[]) {
    const categories = await loadList(library.categories, endpoints.categories);
    if (!categories) return;
    for (const name of names) await getOrCreateCategory(name, categories);
    library.categories.set(categories);
  }

  /**
   * Save the rows the trip accepted as My Items and link them. Rows the server
   * rejected (plan limit, validation) never become My Items.
   */
  async function saveAsMyItems(added: TripItem[], sources: Map<string, SelectedBuiltInItem>) {
    const unlinked = added.filter(
      (row) => !row.master_item_id && sources.has(row.name.toLowerCase())
    );
    if (unlinked.length === 0) return;
    const [masterItems, categories] = await Promise.all([
      loadList(library.masterItems, endpoints.masterItems),
      loadList(library.categories, endpoints.categories),
    ]);
    if (!masterItems || !categories) return;
    const resolved = await resolveMasterItems(
      unlinked.map((row) => sources.get(row.name.toLowerCase())!),
      masterItems,
      categories
    );
    library.masterItems.set(masterItems);
    library.categories.set(categories);

    const links = new Map<string, Partial<TripItem>>();
    unlinked.forEach((row, i) => {
      const masterItemId = resolved[i].item?.id;
      if (masterItemId) links.set(row.id, { master_item_id: masterItemId });
    });
    await store.patchEach(links);
  }

  async function addNow(
    selected: SelectedBuiltInItem[],
    bagId: string | null,
    containerId: string | null,
    options: AddOptions
  ) {
    // The server skips names already on the trip; skip them here too.
    const taken = namesOnTrip();
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

    // Link existing My Items right away; new ones are created once the trip accepts the rows.
    const masterItems = library.masterItems.get() ?? [];
    const existingMasterId = (name: string) =>
      masterItems.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;

    // Containers can't nest: one added to a container goes into that container's bag.
    const containerBagId = containerId ? (store.find(containerId)?.bag_id ?? null) : null;
    const added = await store.addItems(
      toAdd.map((item) => {
        const nested = !!containerId && !item.is_container;
        return {
          name: item.name,
          category_name: item.category,
          quantity: item.quantity,
          notes: item.description,
          bag_id: nested ? null : containerId ? containerBagId : bagId,
          container_item_id: nested ? containerId : null,
          master_item_id: existingMasterId(item.name),
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
    } else if (!options.quiet) {
      showToast(
        'success',
        added.length === 1 ? `Added ${added[0].name}` : `Added ${itemCount(added.length)}`
      );
    }
    await saveAsMyItems(added, new Map(toAdd.map((item) => [item.name.toLowerCase(), item])));
  }

  /**
   * Add a trip type's starter essentials to a bag (null = not in a bag),
   * deduped by name so applying another starter list only adds what's missing.
   * Toiletries go into a Toilet Kit, reusing one already on the trip.
   * Returns how many items were added.
   */
  async function addStarterNow(
    tripTypeId: string,
    modifiers: StarterModifier[],
    bagId: string | null
  ): Promise<number> {
    const tripItems = store.items() ?? [];
    const taken = namesOnTrip();
    const starter = getStarterItems(tripTypeId, modifiers).filter(
      (item) => !taken.has(item.name.toLowerCase())
    );
    if (starter.length === 0) {
      showToast('info', 'Those items are already on your list');
      return 0;
    }
    await ensureCategories([...new Set(starter.map((item) => item.category))]);

    let kit: TripItem | undefined;
    let createdKit: TripItem | undefined;
    if (starter.some(isToiletry)) {
      kit = tripItems.find((i) => i.is_container && i.name.toLowerCase() === 'toilet kit');
      if (!kit) {
        const created = await store.addItems([
          { name: TOILET_KIT, category_name: TOILETRY_CATEGORY, is_container: true, bag_id: bagId },
        ]);
        kit = createdKit = created?.[0];
      }
    }

    const inKit = (item: BuiltInItem) => !!kit && isToiletry(item);
    const added = await store.addItems(
      starter.map((item) => ({
        name: item.name,
        category_name: item.category,
        quantity: getStarterQuantity(item, tripTypeId),
        notes: item.description,
        is_container: item.is_container ?? false,
        bag_id: inKit(item) ? null : bagId,
        container_item_id: inKit(item) ? kit!.id : null,
      }))
    );

    if (!added) {
      // Don't leave a new container behind, empty, when its items failed.
      if (createdKit) {
        await store.deleteItems([createdKit.id], { label: `Removed ${TOILET_KIT}`, quiet: true });
      }
      return 0;
    }
    const count = added.length + (createdKit ? 1 : 0);
    showToast('success', `Added ${itemCount(count)}`);
    return count;
  }

  // Adds run one at a time, so each sees the categories and My Items the
  // previous one created, and a double-tapped "Add all" adds once.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(add: () => Promise<T>): Promise<T> => {
    const next = queue.then(add);
    queue = next.catch(() => undefined);
    return next;
  };

  const addItems = (
    selected: SelectedBuiltInItem[],
    bagId: string | null,
    containerId: string | null,
    options: AddOptions = {}
  ) => enqueue(() => addNow(selected, bagId, containerId, options));

  const addStarter = (tripTypeId: string, modifiers: StarterModifier[], bagId: string | null) =>
    enqueue(() => addStarterNow(tripTypeId, modifiers, bagId));

  return { addItems, addStarter, ensureCategories };
}

export type TripItemAdder = ReturnType<typeof createTripItemAdder>;
