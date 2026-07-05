/**
 * Shared "get or create" helpers for categories and master items.
 *
 * These were previously implemented separately in PackingPage.tsx,
 * AddTripItemForm.tsx, EditTripItem.tsx, and CSVImportExport.tsx, each with
 * slightly different matching/creation behavior. This is the single, unified
 * implementation; see call sites for the (documented) behavior changes each
 * one picked up by switching to it.
 */
import { api, endpoints } from './api';
import { builtInItems } from './built-in-items';
import type { Category, MasterItemWithCategory } from './types';

/**
 * Find a category by name (case-insensitive) in `categories`, creating it via
 * the API if missing. Mutates `categories` by appending any newly created
 * category, so repeated calls against the same array (e.g. one per row of a
 * bulk import) only create each distinct name once.
 *
 * When `name` matches a built-in category, its icon is used on create — this
 * applies whenever the name matches, not only when it was chosen from the
 * built-in browser (e.g. a hand-typed "+ New category" name that happens to
 * match one).
 */
export async function getOrCreateCategory(
  name: string,
  categories: Category[]
): Promise<Category | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  const builtIn = builtInItems.categories.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  const response = await api.post<Category>(endpoints.categories, {
    name: trimmed,
    icon: builtIn?.icon || null,
  });
  if (!response.success || !response.data) return null;

  categories.push(response.data);
  return response.data;
}

export interface GetOrCreateMasterItemInput {
  name: string;
  description?: string | null;
  /** Category display name; empty/omitted leaves the item uncategorized. */
  category?: string | null;
  quantity: number;
  is_container?: boolean;
}

export interface GetOrCreateMasterItemOptions {
  /**
   * When a master item with the same name already exists, PUT the new
   * description/category/quantity onto it instead of leaving it untouched.
   * CSV import uses this — the file is treated as the source of truth for
   * existing rows. Quick-add flows (quick add form, built-in browser)
   * intentionally leave an existing master item's saved metadata alone.
   */
  updateIfExists?: boolean;
}

export type MasterItemUpsertStatus = 'created' | 'updated' | 'unchanged' | 'failed';

export interface MasterItemUpsertResult {
  item: MasterItemWithCategory | null;
  status: MasterItemUpsertStatus;
}

/**
 * Find a master item by name (case-insensitive) in `masterItems`, creating
 * (or, with `updateIfExists`, updating) it via the API as needed. Mutates
 * `masterItems` in place, like `getOrCreateCategory` does for `categories`.
 */
export async function getOrCreateMasterItem(
  item: GetOrCreateMasterItemInput,
  masterItems: MasterItemWithCategory[],
  categories: Category[],
  options: GetOrCreateMasterItemOptions = {}
): Promise<MasterItemUpsertResult> {
  const existing = masterItems.find((m) => m.name.toLowerCase() === item.name.toLowerCase());
  if (existing && !options.updateIfExists) {
    return { item: existing, status: 'unchanged' };
  }

  const categoryRecord = item.category?.trim()
    ? await getOrCreateCategory(item.category, categories)
    : null;

  if (existing) {
    const response = await api.put<MasterItemWithCategory>(endpoints.masterItem(existing.id), {
      name: existing.name,
      description: item.description || existing.description,
      category_id: categoryRecord?.id || existing.category_id,
      default_quantity: item.quantity,
    });
    if (!response.success || !response.data) {
      return { item: existing, status: 'failed' };
    }
    const idx = masterItems.findIndex((m) => m.id === existing.id);
    if (idx !== -1) masterItems[idx] = response.data;
    return { item: response.data, status: 'updated' };
  }

  const response = await api.post<MasterItemWithCategory>(endpoints.masterItems, {
    name: item.name,
    description: item.description ?? null,
    category_id: categoryRecord?.id ?? null,
    default_quantity: item.quantity,
    is_container: item.is_container || false,
  });
  if (!response.success || !response.data) {
    return { item: null, status: 'failed' };
  }
  masterItems.push(response.data);
  return { item: response.data, status: 'created' };
}

/**
 * Resolve master items for a whole batch at once, minimizing round trips:
 * distinct categories are created first, one at a time (so two items sharing
 * a brand-new category name don't race each other into creating duplicate
 * rows for it), then master items are resolved concurrently — memoized by
 * name so duplicate names within the same batch share one create/update
 * instead of racing to create two.
 */
export async function resolveMasterItems<T extends GetOrCreateMasterItemInput>(
  items: T[],
  masterItems: MasterItemWithCategory[],
  categories: Category[],
  options: GetOrCreateMasterItemOptions & {
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<MasterItemUpsertResult[]> {
  const { onProgress, ...upsertOptions } = options;

  const categoryNames = Array.from(
    new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))
  );
  for (const name of categoryNames) {
    await getOrCreateCategory(name, categories);
  }

  const total = items.length;
  let done = 0;
  const cache = new Map<string, Promise<MasterItemUpsertResult>>();
  return Promise.all(
    items.map((item) => {
      const key = item.name.toLowerCase();
      let pending = cache.get(key);
      if (!pending) {
        pending = getOrCreateMasterItem(item, masterItems, categories, upsertOptions).then(
          (result) => {
            done++;
            onProgress?.(done, total);
            return result;
          }
        );
        cache.set(key, pending);
      }
      return pending;
    })
  );
}
