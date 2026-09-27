/**
 * ItemsList Component
 *
 * My Items grouped by category, with an add form, a search box, and inline
 * editing (one item at a time).
 */

import { createMemo, createSignal, For, Show, type Accessor } from 'solid-js';
import type { Category, MasterItemWithCategory } from '../../lib/types';
import { EditIcon, SearchIcon, TrashIcon } from '../ui/Icons';
import { AddItemForm, ItemEditForm } from './ItemForms';

interface ItemsListProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  onDeleteItem: (item: MasterItemWithCategory) => void;
  onItemUpdated: (item: MasterItemWithCategory) => void;
  onItemAdded: (item: MasterItemWithCategory) => void;
}

interface Section {
  id: string;
  icon?: string | null;
  name: string;
  items: MasterItemWithCategory[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function ItemsList(props: ItemsListProps) {
  const [query, setQuery] = createSignal('');
  const [editingId, setEditingId] = createSignal<string | null>(null);

  const sortedCategories = createMemo(() => [...(props.categories() ?? [])].sort(byName));

  const matchingItems = createMemo(() => {
    const items = props.items() ?? [];
    const q = query().trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
    );
  });

  // Categories in name order, then items whose category is missing or unset.
  const sections = createMemo((): Section[] => {
    const byCategory = new Map<string | null, MasterItemWithCategory[]>();
    const known = new Set(sortedCategories().map((c) => c.id));
    for (const item of matchingItems()) {
      const key = item.category_id && known.has(item.category_id) ? item.category_id : null;
      byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
    }

    const sections: Section[] = sortedCategories()
      .filter((c) => byCategory.has(c.id))
      .map((c) => ({
        id: c.id,
        icon: c.icon || '📦',
        name: c.name,
        items: byCategory.get(c.id)!.sort(byName),
      }));
    const uncategorized = byCategory.get(null);
    if (uncategorized) {
      sections.push({ id: 'none', name: 'Uncategorized', items: uncategorized.sort(byName) });
    }
    return sections;
  });

  return (
    <div class="space-y-4 md:space-y-3">
      <AddItemForm categories={sortedCategories} onAdded={props.onItemAdded} />

      <Show when={(props.items()?.length ?? 0) > 0}>
        <div class="relative">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search My Items"
            aria-label="Search My Items"
            class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </Show>

      <For
        each={sections()}
        fallback={
          <Show when={query().trim()}>
            <p class="py-8 text-center text-gray-600">No items match “{query().trim()}”.</p>
          </Show>
        }
      >
        {(section) => (
          <section class="rounded-lg bg-white p-4 shadow-sm md:p-2">
            <h2 class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 md:mb-2 md:text-base">
              <Show when={section.icon}>
                <span class="text-2xl md:text-xl">{section.icon}</span>
              </Show>
              {section.name}
              <span class="text-sm font-normal text-gray-500">({section.items.length})</span>
            </h2>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2 lg:grid-cols-3">
              <For each={section.items}>
                {(item) => (
                  <Show
                    when={editingId() === item.id}
                    fallback={
                      <ItemCard
                        item={item}
                        onEdit={() => setEditingId(item.id)}
                        onDelete={() => props.onDeleteItem(item)}
                      />
                    }
                  >
                    <ItemEditForm
                      item={item}
                      categories={sortedCategories}
                      onCancel={() => setEditingId(null)}
                      onSaved={(updated) => {
                        setEditingId(null);
                        props.onItemUpdated(updated);
                      }}
                    />
                  </Show>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

function ItemCard(props: {
  item: MasterItemWithCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const iconButton = 'flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-200';
  return (
    <div class="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 md:p-2">
      <div class="min-w-0 flex-1">
        <h3 class="font-medium text-gray-900 md:text-sm">{props.item.name}</h3>
        <Show when={props.item.description}>
          <p class="mt-1 text-sm text-gray-600 md:mt-0.5 md:text-xs">{props.item.description}</p>
        </Show>
        <p class="mt-1 text-xs text-gray-500 md:mt-0.5">
          Qty: {props.item.default_quantity}
          {props.item.is_container && ' · Container'}
        </p>
      </div>
      <div class="ml-2 flex">
        <button
          type="button"
          onClick={props.onEdit}
          class={`${iconButton} hover:text-blue-700`}
          aria-label={`Edit ${props.item.name}`}
          title="Edit"
        >
          <EditIcon class="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={props.onDelete}
          class={`${iconButton} hover:text-red-700`}
          aria-label={`Delete ${props.item.name}`}
          title="Delete"
        >
          <TrashIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
