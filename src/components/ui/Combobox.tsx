import {
  createSignal,
  createEffect,
  createMemo,
  createUniqueId,
  For,
  Show,
  onMount,
  onCleanup,
  type JSX,
} from 'solid-js';
import { cn } from '../../lib/utils';
import { NO_BAG_LABEL } from '../../lib/vocabulary';

export interface ComboboxItem {
  id: string;
  name: string;
  description?: string | null;
  group: 'master' | 'builtin';
  categoryId?: string | null;
  categoryName?: string | null;
  defaultQuantity?: number;
  isContainer?: boolean;
  existingLocation?: string;
}

interface ComboboxProps {
  value: string;
  onInput: (value: string) => void;
  onSelect: (item: ComboboxItem) => void;
  items: ComboboxItem[];
  tripItemsWarning?: string | null;
  placeholder?: string;
  autofocus?: boolean;
  minChars?: number;
  maxResults?: number;
  class?: string;
  /** Input id, so a <label for> can name the field. */
  id?: string;
}

export function Combobox(props: ComboboxProps) {
  const minChars = () => props.minChars ?? 2;
  // Unique per instance so two comboboxes mounted at once don't collide on
  // element ids / aria-activedescendant references.
  const listboxId = createUniqueId();
  const itemId = (index: number) => `${listboxId}-item-${index}`;

  const [isOpen, setIsOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1);
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  // Options are shown grouped (My Items first, then Suggestions); keyboard
  // navigation follows that same display order.
  const groups = createMemo(() => [
    {
      label: 'From My Items',
      marker: '✓',
      markerClass: 'text-blue-600',
      items: props.items.filter((item) => item.group === 'master'),
    },
    {
      label: 'Suggestions',
      marker: '○',
      markerClass: 'text-gray-400',
      items: props.items.filter((item) => item.group === 'builtin'),
    },
  ]);
  const orderedItems = createMemo(() => groups().flatMap((g) => g.items));

  // Show dropdown if we have results (or trip items warning) and input meets minimum length
  const shouldShowDropdown = () => {
    return (
      isOpen() &&
      props.value.length >= minChars() &&
      (props.items.length > 0 || props.tripItemsWarning)
    );
  };

  // Adjust highlighted index when items change
  createEffect(() => {
    const currentIndex = highlightedIndex();
    const itemsLength = props.items.length;

    // If highlighted index is out of bounds, reset to first item
    if (currentIndex >= itemsLength && itemsLength > 0) {
      setHighlightedIndex(0);
    } else if (itemsLength === 0) {
      setHighlightedIndex(-1);
    }
  });

  // Handle input changes
  const handleInput: JSX.EventHandler<HTMLInputElement, InputEvent> = (e) => {
    const value = e.currentTarget.value;
    props.onInput(value);

    // Show dropdown if we have enough characters
    const wasOpen = isOpen();
    if (value.length >= minChars()) {
      setIsOpen(true);
      // Only auto-highlight first item when dropdown first opens (not on every keystroke)
      if (!wasOpen && props.items.length > 0) {
        setHighlightedIndex(0);
      }
    } else {
      setIsOpen(false);
    }
  };

  // Handle focus - show dropdown if we have enough characters
  const handleFocus = () => {
    if (props.value.length >= minChars() && props.items.length > 0) {
      setIsOpen(true);
      // Auto-highlight first item when dropdown opens
      setHighlightedIndex(0);
    }
  };

  // Handle blur - close dropdown with delay to allow clicking items
  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  };

  // Handle item selection
  const selectItem = (item: ComboboxItem) => {
    props.onSelect(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        if (isOpen() && props.items.length > 0) {
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev + 1;
            return next >= props.items.length ? 0 : next;
          });
        }
        break;

      case 'ArrowUp':
        if (isOpen() && props.items.length > 0) {
          e.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? props.items.length - 1 : next;
          });
        }
        break;

      // Enter and Tab accept the highlighted suggestion. With nothing
      // highlighted they close the list and keep their usual meaning (submit
      // the form, move focus).
      case 'Enter':
      case 'Tab': {
        const highlighted = isOpen() ? orderedItems()[highlightedIndex()] : undefined;
        if (highlighted) {
          e.preventDefault();
          selectItem(highlighted);
        } else {
          setIsOpen(false);
        }
        break;
      }

      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        break;
    }
  };

  // Click outside detection
  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
    if (props.autofocus && inputRef) {
      inputRef.focus();
    }
  });

  onCleanup(() => {
    document.removeEventListener('mousedown', handleClickOutside);
  });

  return (
    <div ref={containerRef} class={cn('relative w-full', props.class)}>
      <input
        ref={inputRef}
        id={props.id}
        type="text"
        value={props.value}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shouldShowDropdown() ? 'true' : 'false'}
        aria-controls={listboxId}
        aria-activedescendant={highlightedIndex() >= 0 ? itemId(highlightedIndex()) : undefined}
      />

      <Show when={shouldShowDropdown()}>
        <div
          id={listboxId}
          role="listbox"
          class="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg"
        >
          {/* Trip items warning banner */}
          <Show when={props.tripItemsWarning}>
            <div class="border-b border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <span class="mr-1">ℹ️</span>
              {props.tripItemsWarning}
            </div>
          </Show>

          <For each={groups()}>
            {(group) => (
              <Show when={group.items.length > 0}>
                <div class="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                  {group.label}
                </div>
                <For each={group.items}>
                  {(item) => {
                    const index = () => orderedItems().indexOf(item);
                    return (
                      <div
                        id={itemId(index())}
                        role="option"
                        aria-selected={highlightedIndex() === index()}
                        class={cn(
                          'flex cursor-pointer items-start gap-2 px-3 py-2',
                          highlightedIndex() === index() ? 'bg-blue-100' : 'hover:bg-blue-50'
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur
                          selectItem(item);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index())}
                      >
                        <span class={group.markerClass}>{group.marker}</span>
                        <div class="flex-1">
                          <div class="font-medium text-gray-900">
                            {item.name}
                            <Show when={item.existingLocation}>
                              <span class="ml-2 text-xs text-blue-600">
                                (
                                {item.existingLocation === NO_BAG_LABEL
                                  ? NO_BAG_LABEL.toLowerCase()
                                  : `in ${item.existingLocation}`}
                                )
                              </span>
                            </Show>
                          </div>
                          <Show when={item.description}>
                            <div class="text-xs text-gray-500">{item.description}</div>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            )}
          </For>

          {/* No results message */}
          <Show when={props.value.length >= minChars() && props.items.length === 0}>
            <div class="px-3 py-6 text-center">
              <Show
                when={props.tripItemsWarning}
                fallback={
                  <>
                    <p class="text-sm font-medium text-gray-900">No items found</p>
                    <p class="mt-1 text-xs text-gray-500">
                      Type to search or just add a new item to your list
                    </p>
                  </>
                }
              >
                <p class="text-sm font-medium text-gray-900">All matches already in trip</p>
                <p class="mt-1 text-xs text-gray-500">
                  You can still add it again if you need duplicates
                </p>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
