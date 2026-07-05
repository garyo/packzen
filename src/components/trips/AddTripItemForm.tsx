import { createSignal, createResource, createEffect, createMemo, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag, Category, MasterItemWithCategory, TripItem } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Combobox, type ComboboxItem } from '../ui/Combobox';
import { showToast } from '../ui/Toast';
import { searchItems } from '../../lib/search';
import { builtInItems } from '../../lib/built-in-items';
import { getOrCreateCategory, getOrCreateMasterItem } from '../../lib/item-helpers';

interface AddTripItemFormProps {
  tripId: string;
  preSelectedBagId?: string | null;
  preSelectedContainerId?: string | null;
  bags?: Bag[]; // Pre-loaded bags (avoids async fetch)
  categories?: Category[]; // Pre-loaded categories (avoids async fetch)
  tripItems?: TripItem[]; // Pre-loaded trip items (avoids async fetch)
  masterItems?: MasterItemWithCategory[]; // Pre-loaded master items (avoids async fetch)
  /** Called after this form creates a category or master item, so the parent can refresh its own copies. */
  onDataChanged?: () => void;
  onClose: () => void;
  onSaved: (createdItem?: TripItem) => void;
}

export function AddTripItemForm(props: AddTripItemFormProps) {
  const [name, setName] = createSignal('');
  const [quantity, setQuantity] = createSignal(1);
  const [categoryId, setCategoryId] = createSignal<string | null>(null);
  const [location, setLocation] = createSignal<string>('');
  const [isNewCategory, setIsNewCategory] = createSignal(false);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [isContainer, setIsContainer] = createSignal(false);
  const [skipMasterAddition, setSkipMasterAddition] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  let formRef: HTMLFormElement | undefined;

  // Use pre-loaded data from the parent when available; only fetch what's missing.
  const [bags] = createResource<Bag[], string>(
    () => (props.bags ? null : props.tripId), // Only fetch if bags not provided
    async (tripId) => {
      const response = await api.get<Bag[]>(endpoints.tripBags(tripId));
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    },
    { initialValue: props.bags || [] } // Use provided bags as initial value
  );

  const [fetchedCategories, { refetch: refetchFetchedCategories }] = createResource<
    Category[],
    string
  >(
    () => (props.categories ? null : 'categories'), // Only fetch if categories not provided
    async () => {
      const response = await api.get<Category[]>(endpoints.categories);
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    }
  );
  // Preserve undefined (loading) vs. [] (loaded but empty) so downstream
  // effects that gate on "has data arrived yet?" keep working correctly.
  const categories = () => props.categories ?? fetchedCategories();
  // After creating a category, ask the parent to refresh (so the new one flows
  // back down as a prop), or refetch locally if no parent data was provided.
  const refreshCategories = async () => {
    if (props.categories) {
      props.onDataChanged?.();
    } else {
      await refetchFetchedCategories();
    }
  };

  const [fetchedTripItems, { refetch: refetchFetchedTripItems }] = createResource<
    TripItem[],
    string
  >(
    () => (props.tripItems ? null : props.tripId), // Only fetch if tripItems not provided
    async (tripId) => {
      const response = await api.get<TripItem[]>(endpoints.tripItems(tripId));
      if (response.success && response.data) {
        return response.data;
      }
      return [];
    }
  );
  const tripItems = () => props.tripItems ?? fetchedTripItems();
  // The parent keeps its trip-items store current via `onSaved`, which flows
  // back down through the `tripItems` prop; only refetch locally when this
  // form is fetching its own copy (no parent data provided).
  const refreshTripItemsIfLocal = async () => {
    if (!props.tripItems) {
      await refetchFetchedTripItems();
    }
  };

  const [fetchedMasterItems] = createResource<MasterItemWithCategory[], string>(
    () => (props.masterItems ? null : 'master-items'), // Only fetch if masterItems not provided
    async () => {
      const response = await api.get<MasterItemWithCategory[]>(endpoints.masterItems);
      return response.success && response.data ? response.data : [];
    }
  );
  const masterItems = () => props.masterItems ?? fetchedMasterItems();

  // Apply the initial pre-selected bag/container exactly once, as soon as bag
  // and trip-item data is available. Guarded by `initialLocationSet` so this
  // never re-runs later and clobbers the "Add Another" restore logic below,
  // which also calls setLocation (this replaces a previous 250ms setTimeout
  // hack that raced the two).
  const [initialLocationSet, setInitialLocationSet] = createSignal(false);
  createEffect(() => {
    if (initialLocationSet()) return;

    const currentBags = bags();
    if (!currentBags) return;

    if (props.preSelectedContainerId) {
      if (!tripItems()) return; // wait for trip items before resolving the container
      setLocation(`container:${props.preSelectedContainerId}`);
    } else if (props.preSelectedBagId) {
      setLocation(`bag:${props.preSelectedBagId}`);
    } else if (currentBags.length === 1) {
      // Auto-select if there's only one bag
      setLocation(`bag:${currentBags[0].id}`);
    }
    setInitialLocationSet(true);
  });

  // Get available containers
  const availableContainers = () => {
    const items = tripItems() || [];
    return items.filter((item) => item.is_container);
  };

  const existingItemsByName = createMemo(() => {
    const items = tripItems() || [];
    const bagLookup = new Map((bags() || []).map((bag) => [bag.id, bag.name]));
    const containerLookup = new Map(items.map((item) => [item.id, item]));

    const resolveLocation = (item: TripItem, visited = new Set<string>()): string => {
      // Cycle detection: if we've seen this item before, stop recursion
      if (visited.has(item.id)) {
        return 'No Bag';
      }
      visited.add(item.id);

      if (item.container_item_id) {
        const container = containerLookup.get(item.container_item_id);
        if (container) {
          const containerName = container.name?.trim();
          if (containerName) return containerName;
          return resolveLocation(container, visited);
        }
      }

      if (item.bag_id && bagLookup.has(item.bag_id)) {
        return bagLookup.get(item.bag_id)!;
      }

      return 'No Bag';
    };

    // Store multiple locations for items with same name
    const map = new Map<string, string[]>();
    items.forEach((item) => {
      if (!item.name) return;
      const key = item.name.toLowerCase().trim();
      const location = resolveLocation(item);

      if (!map.has(key)) {
        map.set(key, [location]);
      } else {
        const locations = map.get(key)!;
        if (!locations.includes(location)) {
          locations.push(location);
        }
      }
    });

    // Convert to single string per item (join multiple locations)
    const result = new Map<string, string>();
    map.forEach((locations, key) => {
      if (locations.length > 1) {
        result.set(key, `${locations.length} locations`);
      } else {
        result.set(key, locations[0]);
      }
    });
    return result;
  });

  // Warning banner for items already in trip
  const tripItemsWarning = createMemo(() => {
    const query = name().trim();
    if (query.length < 2) return null;

    const tripItemsList = tripItems() || [];
    const tripMatchesRaw = searchItems(query, tripItemsList);

    if (tripMatchesRaw.length === 0) return null;

    // Single match - try to show with location if it fits
    if (tripMatchesRaw.length === 1) {
      const item = tripMatchesRaw[0];
      const location = existingItemsByName().get(item.name.toLowerCase().trim());
      const message = `${item.name} already in ${location}`;

      // If the message is compact enough (< 50 chars), show it
      if (message.length <= 50) {
        return message;
      }
      // Otherwise fall back to compact format
      return `1 already in trip: ${item.name}`;
    }

    // Multiple matches - show count and names
    const names = tripMatchesRaw
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ');
    const suffix = tripMatchesRaw.length > 3 ? '...' : '';
    return `${tripMatchesRaw.length} already in trip: ${names}${suffix}`;
  });

  // Search results for autocomplete (excluding trip items)
  const searchResults = createMemo(() => {
    const query = name().trim();
    if (query.length < 2) return [];

    const maxResults = 8;

    const tripItemsList = tripItems() || [];
    const tripMatchesRaw = searchItems(query, tripItemsList);
    const tripNameSet = new Set(tripMatchesRaw.map((item) => item.name.toLowerCase().trim()));

    // Search master items (exclude items already in trip)
    const masterResults = searchItems(query, masterItems() || []).filter(
      (item) => !tripNameSet.has(item.name.toLowerCase().trim())
    );

    // Search built-in items (exclude items already in trip)
    const builtInResults = searchItems(query, builtInItems.items).filter(
      (item) => !tripNameSet.has(item.name.toLowerCase().trim())
    );

    const master = masterResults.slice(0, Math.min(5, maxResults)).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      group: 'master' as const,
      categoryId: item.category_id,
      categoryName: item.category_name,
      defaultQuantity: item.default_quantity,
      isContainer: item.is_container,
      existingLocation: existingItemsByName().get(item.name.toLowerCase().trim()),
    }));

    // Filter out built-in items that have the same name as master items (case-insensitive)
    const masterItemNames = new Set(masterResults.map((item) => item.name.toLowerCase().trim()));
    const filteredBuiltIn = builtInResults.filter(
      (item) => !masterItemNames.has(item.name.toLowerCase().trim())
    );

    const remainingSlots = Math.max(maxResults - master.length, 0);

    const builtin = filteredBuiltIn.slice(0, remainingSlots).map((item, idx) => ({
      id: `builtin-${idx}`,
      name: item.name,
      description: item.description,
      group: 'builtin' as const,
      categoryName: item.category,
      defaultQuantity: item.default_quantity,
      isContainer: false,
      existingLocation: existingItemsByName().get(item.name.toLowerCase().trim()),
    }));

    return [...master, ...builtin];
  });

  const handleItemSelect = (item: ComboboxItem) => {
    setName(item.name);

    // Populate category
    if (item.categoryId) {
      setCategoryId(item.categoryId);
      setIsNewCategory(false);
    } else if (item.categoryName) {
      // Match built-in category name to user's categories (case-insensitive)
      const matchedCategory = categories()?.find(
        (cat) => cat.name.toLowerCase() === item.categoryName!.toLowerCase()
      );
      if (matchedCategory) {
        setCategoryId(matchedCategory.id);
        setIsNewCategory(false);
      } else {
        // Pre-fill new category with the built-in category name
        setCategoryId(null);
        setIsNewCategory(true);
        setNewCategoryName(item.categoryName);
      }
    }

    // Populate quantity
    if (item.defaultQuantity) {
      setQuantity(item.defaultQuantity);
    }

    // Populate container flag
    if (item.isContainer !== undefined) {
      setIsContainer(item.isContainer);
    }
  };

  // Sort categories alphabetically
  const sortedCategories = createMemo(() => {
    const cats = categories() || [];
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Built-in category names not already in user's categories
  const builtInOnlyCategories = createMemo(() => {
    const userNames = new Set((categories() || []).map((c) => c.name.toLowerCase()));
    const seen = new Set<string>();
    return builtInItems.categories
      .map((c) => c.name)
      .filter((name) => {
        const lower = name.toLowerCase();
        if (userNames.has(lower) || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  });

  const handleSubmit = async (e: Event, keepOpenAfterSubmit = false) => {
    e.preventDefault();
    if (saving()) return;
    setSaving(true);

    const itemName = name().trim();
    if (!itemName) {
      showToast('error', 'Item name is required');
      setSaving(false);
      return;
    }

    // Create new category if needed
    let finalCategoryId = categoryId();
    const newCatNameInput = newCategoryName().trim();

    if (isNewCategory()) {
      const newCatName = newCatNameInput;
      if (!newCatName) {
        showToast('error', 'Category name is required');
        setSaving(false);
        return;
      }
      const newCategoryCache = categories() ? [...categories()!] : [];
      // Dedup case-insensitively like the other get-or-create call sites,
      // instead of always creating — retyping (or re-selecting a built-in
      // name) used to silently create a duplicate category.
      const alreadyExists = newCategoryCache.some(
        (c) => c.name.toLowerCase() === newCatName.toLowerCase()
      );
      const category = await getOrCreateCategory(newCatName, newCategoryCache);
      if (category) {
        finalCategoryId = category.id;
        setCategoryId(finalCategoryId);
        await refreshCategories();
        showToast(
          'success',
          alreadyExists
            ? `Using existing category "${category.name}"`
            : `Created category "${newCatName}"`
        );
      } else {
        showToast('error', 'Failed to create category');
        setSaving(false);
        return;
      }
    }

    // Check if item exists in master list
    const existingMasterItem = masterItems()?.find(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    let masterItemId = existingMasterItem?.id;
    const categoriesList = categories() ? [...categories()!] : [];
    let categoryName: string | null | undefined = finalCategoryId
      ? categoriesList.find((cat) => cat.id === finalCategoryId)?.name || newCatNameInput || null
      : null;

    // If not in master list, add it (unless explicitly disabled)
    if (!existingMasterItem && !skipMasterAddition()) {
      const masterItemsCache = masterItems() ? [...masterItems()!] : [];
      const { item: createdMasterItem } = await getOrCreateMasterItem(
        {
          name: itemName,
          category: categoryName,
          quantity: quantity(),
          is_container: isContainer(),
        },
        masterItemsCache,
        categoriesList
      );
      if (createdMasterItem) {
        masterItemId = createdMasterItem.id;
        categoryName = createdMasterItem.category_name;
        showToast('success', `Added "${itemName}" to My Items`);
        if (props.masterItems) {
          props.onDataChanged?.();
        }
      }
    } else if (existingMasterItem) {
      categoryName = existingMasterItem.category_name;
    }

    // Parse location to determine bag_id and container_item_id
    const loc = location();
    let bagId: string | null = null;
    let containerItemId: string | null = null;

    if (loc.startsWith('bag:')) {
      bagId = loc.substring(4);
    } else if (loc.startsWith('container:')) {
      containerItemId = loc.substring(10);
    }

    // Validate: containers cannot be inside other containers
    if (isContainer() && containerItemId) {
      showToast('error', 'Containers cannot be placed inside other containers');
      setSaving(false);
      return;
    }

    // Add to trip
    const response = await api.post(endpoints.tripItems(props.tripId), {
      name: itemName,
      category_name: categoryName,
      quantity: quantity(),
      bag_id: bagId,
      master_item_id: masterItemId,
      is_container: isContainer(),
      container_item_id: containerItemId,
    });

    if (response.success) {
      showToast('success', 'Item added to trip');

      // Get the created item from the response
      const createdItem = response.data as TripItem | undefined;

      if (keepOpenAfterSubmit) {
        // Smart reuse logic for Add Another
        const wasContainer = isContainer();
        const lastLocation = location();
        const lastCategoryId = categoryId();

        // Reset fields (including location to trigger reactivity on restore)
        setName('');
        setIsNewCategory(false);
        setNewCategoryName('');
        setIsContainer(false);
        setSkipMasterAddition(false);
        setLocation(''); // Clear location so restoration triggers a signal change
        setSaving(false);

        // Call onSaved with created item to update store (important for containers to appear in list).
        // When tripItems comes from the parent's store, this update flows back down through the
        // `tripItems` prop synchronously; only forms fetching their own copy need an explicit refetch.
        props.onSaved(createdItem);
        await refreshTripItemsIfLocal();

        if (wasContainer && createdItem) {
          // If we just created a container, pre-select it as the container for the next item
          setLocation(`container:${createdItem.id}`);
        } else {
          // For regular items, restore the previous location
          setLocation(lastLocation);
        }
        setCategoryId(lastCategoryId);
        formRef?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
      } else {
        props.onSaved(createdItem);
        props.onClose();
      }
    } else {
      showToast('error', response.error || 'Failed to add item');
      setSaving(false);
    }
  };

  const handleAddAnother = async (e: Event) => {
    await handleSubmit(e, true);
  };

  return (
    <Modal title="Add Item" onClose={props.onClose}>
      <form ref={formRef} onSubmit={handleAddAnother} class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Item Name</label>
          <Combobox
            value={name()}
            onInput={setName}
            onSelect={handleItemSelect}
            items={searchResults()}
            tripItemsWarning={tripItemsWarning()}
            placeholder="e.g., Toothbrush"
            autofocus
            minChars={2}
            maxResults={8}
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <Show
            when={!isNewCategory()}
            fallback={
              <div class="flex gap-2">
                <Input
                  type="text"
                  value={newCategoryName()}
                  onInput={(e) => setNewCategoryName(e.currentTarget.value)}
                  placeholder="Enter category name"
                  class="flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsNewCategory(false);
                    setNewCategoryName('');
                  }}
                  class="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>
            }
          >
            <select
              value={categoryId() || ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '__new__') {
                  setIsNewCategory(true);
                  setCategoryId(null);
                } else if (value.startsWith('__builtin__:')) {
                  setIsNewCategory(true);
                  setCategoryId(null);
                  setNewCategoryName(value.substring('__builtin__:'.length));
                } else {
                  setCategoryId(value || null);
                }
              }}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No category</option>
              <For each={sortedCategories()}>
                {(category) => <option value={category.id}>{category.name}</option>}
              </For>
              <Show when={builtInOnlyCategories().length > 0}>
                <optgroup label="Built-in categories">
                  <For each={builtInOnlyCategories()}>
                    {(name) => <option value={`__builtin__:${name}`}>{name}</option>}
                  </For>
                </optgroup>
              </Show>
              <option value="__new__">+ New category...</option>
            </select>
          </Show>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
          <Input
            type="number"
            min="1"
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
          />
        </div>

        {/* Combined Bag/Container location (only show if not a container itself) */}
        <Show when={!isContainer()}>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Inside Bag/Container</label>
            <select
              value={location()}
              onChange={(e) => setLocation(e.target.value)}
              class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No bag</option>
              <For each={bags()}>
                {(bag) => <option value={`bag:${bag.id}`}>{bag.name}</option>}
              </For>
              <Show when={availableContainers().length > 0}>
                <For each={availableContainers()}>
                  {(container) => (
                    <option value={`container:${container.id}`}>📦 {container.name}</option>
                  )}
                </For>
              </Show>
            </select>
          </div>
        </Show>

        {/* Container checkbox */}
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-container-add"
            checked={isContainer()}
            onChange={(e) => {
              setIsContainer(e.currentTarget.checked);
              if (e.currentTarget.checked && location().startsWith('container:')) {
                setLocation(''); // Containers can't be inside containers
              }
            }}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container-add" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag like a toilet kit)
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="skip-master-add"
            checked={skipMasterAddition()}
            onChange={(e) => setSkipMasterAddition(e.currentTarget.checked)}
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="skip-master-add" class="text-sm text-gray-600">
            Don't add to My Items
          </label>
        </div>

        <div class="flex gap-2 pt-4">
          <Button type="button" onClick={handleSubmit} class="flex-1" disabled={saving()}>
            Add
          </Button>
          <Button
            type="submit"
            class="flex flex-1 items-center justify-center gap-2"
            variant="secondary"
            disabled={saving()}
          >
            <span>Add More</span>
            <span class="rounded bg-gray-900/10 px-1.5 py-0.5 font-mono text-xs">↵</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
