import { createMemo, For, Show } from 'solid-js';
import type { Category } from '../../lib/types';
import { builtInItems } from '../../lib/built-in-items';
import { getOrCreateCategory } from '../../lib/item-helpers';
import { Input } from '../ui/Input';

/**
 * A category choice, encoded as one string so it can drive a `<select>`:
 * - `''`          no category
 * - `<id>`        one of the user's categories
 * - `name:<name>` a category by name with no record yet (a suggestion, or an
 *                 item's current category that has no record)
 * - `new:<name>`  a new name being typed
 */
export type CategoryChoice = string;

const NAME_PREFIX = 'name:';
const NEW_PREFIX = 'new:';

const lower = (s: string) => s.trim().toLowerCase();

const choiceName = (choice: CategoryChoice): string | null =>
  choice.startsWith(NAME_PREFIX)
    ? choice.slice(NAME_PREFIX.length)
    : choice.startsWith(NEW_PREFIX)
      ? choice.slice(NEW_PREFIX.length)
      : null;

/** The choice that selects a category by its name, preferring an existing record. */
export function categoryChoiceForName(
  name: string | null | undefined,
  categories: Category[] | undefined
): CategoryChoice {
  if (!name?.trim()) return '';
  const match = categories?.find((c) => lower(c.name) === lower(name));
  return match ? match.id : `${NAME_PREFIX}${name.trim()}`;
}

/**
 * Resolve a choice to a category record, creating one for a name-based
 * choice. `categories` is updated in place with any created category, so
 * later lookups against the same array (e.g. `getOrCreateMasterItem`) find it.
 */
export async function resolveCategoryChoice(
  choice: CategoryChoice,
  categories: Category[]
): Promise<{ category: Category | null } | { error: string }> {
  const name = choiceName(choice);
  if (name === null) {
    return { category: choice ? (categories.find((c) => c.id === choice) ?? null) : null };
  }
  if (!name.trim()) return { error: 'Category name is required' };
  const category = await getOrCreateCategory(name, categories);
  return category ? { category } : { error: 'Failed to create category' };
}

/** Whether resolving this choice may create a category record. */
export const choiceMayCreateCategory = (choice: CategoryChoice) => choiceName(choice) !== null;

export function CategoryPicker(props: {
  /** Field id, so a <label for> can name it. */
  id?: string;
  categories: Category[] | undefined;
  value: CategoryChoice;
  onChange: (choice: CategoryChoice) => void;
}) {
  const sortedCategories = createMemo(() =>
    [...(props.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  );

  // Built-in category names the user doesn't have yet, plus the current
  // name-based choice so it always shows as selected.
  const suggestions = createMemo(() => {
    const seen = new Set((props.categories ?? []).map((c) => lower(c.name)));
    const current = props.value.startsWith(NAME_PREFIX) ? [choiceName(props.value)!] : [];
    return [...current, ...builtInItems.categories.map((c) => c.name)]
      .filter((name) => {
        const key = lower(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  });

  return (
    <Show
      when={!props.value.startsWith(NEW_PREFIX)}
      fallback={
        <div class="flex gap-2">
          <Input
            id={props.id}
            type="text"
            value={choiceName(props.value) ?? ''}
            onInput={(e) => props.onChange(`${NEW_PREFIX}${e.currentTarget.value}`)}
            placeholder="Enter category name"
            class="flex-1"
            autofocus
          />
          <button
            type="button"
            onClick={() => props.onChange('')}
            class="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
        </div>
      }
    >
      <select
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      >
        <option value="">No category</option>
        {/* `selected` too, so a category chosen before its option exists (one
            just created) is shown once the list catches up. */}
        <For each={sortedCategories()}>
          {(category) => (
            <option value={category.id} selected={props.value === category.id}>
              {category.name}
            </option>
          )}
        </For>
        <Show when={suggestions().length > 0}>
          <optgroup label="Suggested categories">
            <For each={suggestions()}>
              {(name) => <option value={`${NAME_PREFIX}${name}`}>{name}</option>}
            </For>
          </optgroup>
        </Show>
        <option value={NEW_PREFIX}>+ New category...</option>
      </select>
    </Show>
  );
}
