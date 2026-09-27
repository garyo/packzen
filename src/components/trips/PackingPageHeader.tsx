/**
 * The packing page header: trip name and progress, the Pack | Add switch,
 * search (a miss offers to add the item), print, and the ⋮ menu.
 */

import {
  Show,
  type Accessor,
  type JSX,
  onMount,
  onCleanup,
  createEffect,
  createSignal,
} from 'solid-js';
import type { Trip } from '../../lib/types';
import { packingProgress, type PackingStats } from '../../lib/packing-stats';
import { Button } from '../ui/Button';
import {
  ChevronLeftIcon,
  EditIcon,
  SearchIcon,
  MoreVerticalIcon,
  PrinterIcon,
  PlusIcon,
} from '../ui/Icons';
import { formatDateRange } from '../../lib/utils';

export type ViewMode = 'pack' | 'add';

interface PackingPageHeaderProps {
  trip: Accessor<Trip | null | undefined>;
  stats: Accessor<PackingStats>;
  /** All items on the list, for the search result count. */
  itemCount: Accessor<number>;
  visibleItemCount: Accessor<number>;
  selectMode: Accessor<boolean>;
  sortBy: Accessor<'bag' | 'category'>;
  viewMode: Accessor<ViewMode>;
  showUnpackedOnly: Accessor<boolean>;
  onToggleShowUnpackedOnly: () => void;
  onToggleSelectMode: () => void;
  onToggleSortBy: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onManageBags: () => void;
  onShowNotes: () => void;
  onExport: () => void;
  onImport: () => void;
  onClearAll: () => void;
  onDeleteTrip: () => void;
  onEditTrip: () => void;
  searchQuery: Accessor<string>;
  onSearchChange: (value: string) => void;
  /** Whether an item on the list is named exactly like the search. */
  searchHasExactMatch: Accessor<boolean>;
  /** Add a new item with this name. */
  onAddNamed: (name: string) => void;
  onScrollToItemRequest?: (itemId: string) => void;
}

const TOOL_BUTTON =
  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 lg:h-9 lg:w-9';

function MenuItem(props: { onClick: () => void; danger?: boolean; children: JSX.Element }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-100"
      classList={{ 'text-red-600': props.danger, 'text-gray-900': !props.danger }}
    >
      {props.children}
    </button>
  );
}

function ModeSwitch(props: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const option = (mode: ViewMode, label: string) => (
    <button
      type="button"
      aria-pressed={props.mode === mode}
      onClick={() => props.onChange(mode)}
      class="flex-1 rounded-md px-4 text-sm font-semibold transition-colors lg:!min-h-8"
      classList={{
        'bg-white text-blue-700 shadow-sm': props.mode === mode,
        'text-gray-600 hover:text-gray-900': props.mode !== mode,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Mode"
      class="flex flex-1 rounded-lg bg-gray-100 p-0.5 lg:w-44 lg:flex-none"
    >
      {option('pack', 'Pack')}
      {option('add', 'Add')}
    </div>
  );
}

export function PackingPageHeader(props: PackingPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let searchContainerRef: HTMLDivElement | undefined;
  let searchOverlayRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const printHref = () => `/trips/${props.trip()?.id}/print?sortBy=${props.sortBy()}`;
  const isPacking = () => props.viewMode() === 'pack';

  const query = () => props.searchQuery().trim();
  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => {
    if (!isSearchOpen()) return;
    setIsSearchOpen(false);
    if (query()) props.onSearchChange('');
  };
  const canAddQuery = () => !!query() && !props.searchHasExactMatch();
  const addQuery = () => {
    const name = query();
    closeSearch();
    props.onAddNamed(name);
  };

  const menuAction = (action: () => void) => () => {
    setShowMenu(false);
    action();
  };

  onMount(() => {
    const findTripItemId = (node: HTMLElement | null): string | null => {
      while (node) {
        if (node.dataset?.tripItemId) return node.dataset.tripItemId;
        node = node.parentElement;
      }
      return null;
    };

    // Tapping a search result finds it: swallow the click that follows this
    // mousedown so it doesn't also pack the item (or hit a card button).
    // A press that never becomes a click is cleared by the next mousedown.
    const swallowNextClick = () => {
      const swallow = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener('mousedown', stop, true);
      };
      const stop = () => document.removeEventListener('click', swallow, true);
      document.addEventListener('click', swallow, { capture: true, once: true });
      document.addEventListener('mousedown', stop, { capture: true, once: true });
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (showMenu() && menuRef && !menuRef.contains(target)) setShowMenu(false);
      const inSearch =
        !!target &&
        (!!searchContainerRef?.contains(target) || !!searchOverlayRef?.contains(target));
      if (isSearchOpen() && !inSearch) {
        const tripItemId = findTripItemId(target);
        closeSearch();
        if (tripItemId) {
          swallowNextClick();
          props.onScrollToItemRequest?.(tripItemId);
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowMenu(false);
      closeSearch();
    };

    const isTypingContext = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };

    const handleSlashShortcut = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingContext(e.target) || !isPacking() || props.selectMode()) return;
      if (!isSearchOpen()) {
        e.preventDefault();
        openSearch();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleSlashShortcut);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleSlashShortcut);
    });
  });

  createEffect(() => {
    if (isSearchOpen()) requestAnimationFrame(() => searchInputRef?.focus());
  });

  const stats = () => props.stats();

  return (
    <header class="relative flex-shrink-0 border-b border-gray-200 bg-white">
      <div class="container mx-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 pb-2 md:px-4 lg:py-2">
        {/* Title and progress */}
        <div class="flex min-w-0 basis-full items-center lg:flex-1 lg:basis-0">
          <a
            href="/trips"
            class="flex flex-shrink-0 items-center justify-center text-gray-600 hover:text-gray-900"
            title="Back to My Trips"
            aria-label="Back to My Trips"
          >
            <ChevronLeftIcon class="h-6 w-6" />
          </a>
          <div class="min-w-0 flex-1">
            <button
              type="button"
              onClick={props.onEditTrip}
              class="btn-compact flex max-w-full items-center gap-1.5 text-left text-gray-900 hover:text-blue-700"
              title="Edit trip name and dates"
            >
              <h1 class="truncate text-lg leading-tight font-bold">
                {props.trip()?.name || 'Packing'}
              </h1>
              <EditIcon class="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            </button>
            <p class="truncate text-xs text-gray-600">
              <Show when={formatDateRange(props.trip()?.start_date, props.trip()?.end_date)}>
                {(dates) => <span class="hidden sm:inline">{dates()} · </span>}
              </Show>
              <Show
                when={props.showUnpackedOnly() && isPacking()}
                fallback={
                  <>
                    {stats().packed} of {stats().total} packed
                    <Show when={stats().skipped > 0}>
                      <span class="text-gray-500"> · {stats().skipped} skipped</span>
                    </Show>
                    <Show when={stats().remaining > 0 && stats().packed > 0 && isPacking()}>
                      {' · '}
                      <button
                        type="button"
                        onClick={props.onToggleShowUnpackedOnly}
                        class="btn-compact text-blue-600 hover:underline"
                        title="Show only what's left to pack"
                      >
                        {stats().remaining} left
                      </button>
                    </Show>
                  </>
                }
              >
                <button
                  type="button"
                  onClick={props.onToggleShowUnpackedOnly}
                  class="btn-compact rounded bg-blue-100 px-1.5 text-blue-700 hover:bg-blue-200"
                  title="Show all items"
                >
                  Showing {stats().remaining} left ✕
                </button>
              </Show>
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <Show
          when={!props.selectMode()}
          fallback={
            <div class="flex w-full items-center gap-2 lg:w-auto">
              <span class="flex-1 text-sm text-gray-600">Tap items to select them</span>
              <Button variant="secondary" size="sm" onClick={props.onToggleSelectMode}>
                Done
              </Button>
            </div>
          }
        >
          <div class="flex w-full items-center gap-1 lg:w-auto">
            <ModeSwitch mode={props.viewMode()} onChange={props.onSetViewMode} />

            <Show when={isPacking()}>
              <div class="relative" ref={searchContainerRef}>
                <button
                  type="button"
                  class={TOOL_BUTTON}
                  classList={{ 'bg-blue-50 text-blue-700': isSearchOpen() || !!query() }}
                  onClick={() => (isSearchOpen() ? closeSearch() : openSearch())}
                  title="Search items (/)"
                  aria-label="Search items"
                >
                  <SearchIcon class="h-5 w-5" />
                </button>
                <Show when={isSearchOpen()}>
                  <div
                    ref={searchOverlayRef}
                    class="fixed top-2 left-1/2 z-40 w-[min(calc(100vw-1rem),360px)] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                  >
                    <div class="relative">
                      <input
                        ref={searchInputRef}
                        type="text"
                        inputmode="search"
                        enterkeyhint="search"
                        value={props.searchQuery()}
                        onInput={(e) => props.onSearchChange(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            canAddQuery() &&
                            props.visibleItemCount() === 0
                          ) {
                            e.preventDefault();
                            addQuery();
                          }
                        }}
                        placeholder="Search or add an item…"
                        aria-label="Search items"
                        class="w-full appearance-none rounded-md border border-gray-200 py-2 pr-9 pl-2 text-base focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                      />
                      <Show when={query()}>
                        <button
                          type="button"
                          onClick={() => props.onSearchChange('')}
                          class="btn-compact absolute top-1/2 right-1 -translate-y-1/2 rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:text-gray-900"
                          aria-label="Clear search"
                        >
                          ×
                        </button>
                      </Show>
                    </div>
                    <div class="mt-1 flex min-h-5 items-center justify-between gap-2 text-xs text-gray-500">
                      <span>
                        {query() ? `${props.visibleItemCount()} of ${props.itemCount()}` : ' '}
                      </span>
                      <Show when={canAddQuery()}>
                        <button
                          type="button"
                          onClick={addQuery}
                          class="flex min-w-0 items-center gap-1 rounded-md px-2 font-medium text-blue-700 hover:bg-blue-50"
                        >
                          <PlusIcon class="h-4 w-4 flex-shrink-0" />
                          <span class="truncate">Add “{query()}”</span>
                        </button>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            <a
              href={printHref()}
              target="_blank"
              class={TOOL_BUTTON}
              aria-label="Print checklist"
              title="Print checklist"
            >
              <PrinterIcon class="h-5 w-5" />
            </a>

            <div class="relative" ref={menuRef}>
              <button
                type="button"
                class={TOOL_BUTTON}
                onClick={() => setShowMenu(!showMenu())}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={showMenu()}
              >
                <MoreVerticalIcon class="h-5 w-5" />
              </button>
              <Show when={showMenu()}>
                {/* Anchored to the right edge: ⋮ is always the last control. */}
                <div
                  role="menu"
                  class="absolute top-full right-0 z-30 mt-1 max-h-[75dvh] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                >
                  <Show when={isPacking()}>
                    <MenuItem onClick={menuAction(props.onToggleSelectMode)}>Select</MenuItem>
                    <MenuItem onClick={menuAction(props.onToggleSortBy)}>
                      {props.sortBy() === 'bag' ? 'Group by category' : 'Group by bag'}
                    </MenuItem>
                  </Show>
                  <MenuItem onClick={menuAction(props.onManageBags)}>Bags…</MenuItem>
                  <MenuItem onClick={menuAction(props.onShowNotes)}>
                    Trip notes
                    <Show when={props.trip()?.notes?.trim()}>
                      <span class="h-2 w-2 rounded-full bg-blue-500" aria-label="has notes" />
                    </Show>
                  </MenuItem>
                  <MenuItem onClick={menuAction(props.onEditTrip)}>Edit trip details…</MenuItem>
                  <div class="my-1 border-t border-gray-100" />
                  <MenuItem onClick={menuAction(props.onExport)}>Export trip</MenuItem>
                  <MenuItem onClick={menuAction(props.onImport)}>Import / merge trip…</MenuItem>
                  <div class="my-1 border-t border-gray-100" />
                  <MenuItem danger onClick={menuAction(props.onClearAll)}>
                    Unpack all
                  </MenuItem>
                  <MenuItem danger onClick={menuAction(props.onDeleteTrip)}>
                    Delete trip
                  </MenuItem>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <div class="h-1 w-full bg-gray-100" aria-hidden="true">
        <div
          class="h-1 bg-green-600 transition-all duration-300"
          style={{ width: `${packingProgress(stats())}%` }}
        />
      </div>
    </header>
  );
}
