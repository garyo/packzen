import { createSignal, createEffect, For, Show, onMount, onCleanup, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

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
}

export function Combobox(props: ComboboxProps) {
  const minChars = () => props.minChars ?? 2;
  const maxResults = () => props.maxResults ?? 8;

  const [isOpen, setIsOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1);
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  // Group items by type
  const masterItems = () => props.items.filter((item) => item.group === 'master');
  const builtinItems = () => props.items.filter((item) => item.group === 'builtin');

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

      case 'Enter':
        if (isOpen() && props.items.length > 0) {
          e.preventDefault();
          const highlighted = highlightedIndex();
          if (highlighted >= 0 && highlighted < props.items.length) {
            selectItem(props.items[highlighted]);
          } else {
            // No item highlighted - close dropdown
            setIsOpen(false);
          }
        }
        // If dropdown is closed, let Enter submit the form (don't preventDefault)
        break;

      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        break;

      case 'Tab':
        if (isOpen() && props.items.length > 0) {
          e.preventDefault();
          const highlightedTab = highlightedIndex();
          if (highlightedTab >= 0 && highlightedTab < props.items.length) {
            // Accept the highlighted suggestion
            selectItem(props.items[highlightedTab]);
          } else {
            // No item highlighted - just close dropdown and let tab continue
            setIsOpen(false);
          }
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
        aria-expanded={shouldShowDropdown()}
        aria-controls="combobox-listbox"
        aria-activedescendant={
          highlightedIndex() >= 0 ? `combobox-item-${highlightedIndex()}` : undefined
        }
      />

      <Show when={shouldShowDropdown()}>
        <div
          id="combobox-listbox"
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

          {/* Master items section */}
          <Show when={masterItems().length > 0}>
            <div class="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
              From My Items
            </div>
            <For each={masterItems()}>
              {(item) => {
                const index = props.items.indexOf(item);

                return (
                  <div
                    id={`combobox-item-${index}`}
                    role="option"
                    aria-selected={highlightedIndex() === index}
                    class={cn(
                      'flex cursor-pointer items-start gap-2 px-3 py-2',
                      highlightedIndex() === index ? 'bg-blue-100' : 'hover:bg-blue-50'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent blur
                      selectItem(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span class="text-blue-600">✓</span>
                    <div class="flex-1">
                      <div class="font-medium text-gray-900">
                        {item.name}
                        <Show when={item.existingLocation}>
                          <span class="ml-2 text-xs text-blue-600">
                            (
                            {item.existingLocation === 'No Bag'
                              ? 'no bag'
                              : `in ${item.existingLocation}`}
                            )
                          </span>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>

          {/* Built-in items section */}
          <Show when={builtinItems().length > 0}>
            <div class="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
              From Templates
            </div>
            <For each={builtinItems()}>
              {(item) => {
                const index = props.items.indexOf(item);

                return (
                  <div
                    id={`combobox-item-${index}`}
                    role="option"
                    aria-selected={highlightedIndex() === index}
                    class={cn(
                      'flex cursor-pointer items-start gap-2 px-3 py-2',
                      highlightedIndex() === index ? 'bg-blue-100' : 'hover:bg-blue-50'
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent blur
                      selectItem(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span class="text-gray-400">○</span>
                    <div class="flex-1">
                      <div class="font-medium text-gray-900">
                        {item.name}
                        <Show when={item.existingLocation}>
                          <span class="ml-2 text-xs text-blue-600">
                            (
                            {item.existingLocation === 'No Bag'
                              ? 'no bag'
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
