/**
 * PackingPageHeader Component
 *
 * Header with progress bar, trip info, and action buttons
 * Extracted from PackingPage for better separation of concerns
 */

import { Show, type Accessor, onMount, onCleanup, createEffect, createSignal } from 'solid-js';
import type { Trip } from '../../lib/types';
import { Button } from '../ui/Button';
import { formatDateRange } from '../../lib/utils';

interface PackingPageHeaderProps {
  trip: Accessor<Trip | null | undefined>;
  packedCount: Accessor<number>;
  totalCount: Accessor<number>;
  unpackedCount: Accessor<number>;
  visibleItemCount: Accessor<number>;
  progress: Accessor<number>;
  selectMode: Accessor<boolean>;
  sortBy: Accessor<'bag' | 'category'>;
  viewMode: Accessor<'pack' | 'add'>;
  showUnpackedOnly: Accessor<boolean>;
  onToggleShowUnpackedOnly: () => void;
  onToggleSelectMode: () => void;
  onToggleSortBy: () => void;
  onToggleViewMode: () => void;
  onAddItem: () => void;
  onManageBags: () => void;
  onAddFromMaster: () => void;
  onBrowseTemplates: () => void;
  onExport: () => void;
  onImport: () => void;
  onClearAll: () => void;
  onDeleteTrip: () => void;
  onEditTrip: () => void;
  searchQuery: Accessor<string>;
  onSearchChange: (value: string) => void;
  onScrollToItemRequest?: (itemId: string) => void;
}

export function PackingPageHeader(props: PackingPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let searchContainerRef: HTMLDivElement | undefined;
  let searchOverlayRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const isSearchActive = () => props.searchQuery().trim().length > 0;
  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => {
    if (!isSearchOpen()) return;
    setIsSearchOpen(false);
    if (isSearchActive()) {
      props.onSearchChange('');
    }
  };

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const findTripItemId = (node: HTMLElement | null): string | null => {
      while (node) {
        if (node.dataset && node.dataset.tripItemId) {
          return node.dataset.tripItemId;
        }
        node = node.parentElement;
      }
      return null;
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
      const target = e.target as HTMLElement | null;
      const clickedInsideSearchTrigger =
        searchContainerRef && target ? searchContainerRef.contains(target) : false;
      const clickedInsideOverlay =
        searchOverlayRef && target ? searchOverlayRef.contains(target) : false;

      if (isSearchOpen() && !clickedInsideSearchTrigger && !clickedInsideOverlay) {
        const tripItemId = findTripItemId(target);
        closeSearch();
        if (tripItemId) {
          props.onScrollToItemRequest?.(tripItemId);
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMenu()) setShowMenu(false);
        if (isSearchOpen()) closeSearch();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  createEffect(() => {
    if (isSearchOpen()) {
      requestAnimationFrame(() => {
        searchInputRef?.focus();
      });
    }
  });

  return (
    <header class="relative flex-shrink-0 border-b border-gray-200 bg-white">
      <div class="container mx-auto px-4 py-4 lg:py-2">
        {/* Two-row layout on mobile/tablet, single row on desktop */}
        <div class="mb-3 flex flex-col gap-2 lg:mb-2 lg:flex-row lg:items-center lg:justify-between">
          {/* Title row */}
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <a
              href="/dashboard"
              class="flex flex-shrink-0 items-center text-gray-600 hover:text-gray-900"
              title="Home"
            >
              <svg
                class="h-6 w-6 lg:h-5 lg:w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </a>
            <a
              href="/trips"
              class="flex flex-shrink-0 items-center text-gray-600 hover:text-gray-900"
              title="Back to Trips"
            >
              <svg
                class="h-5 w-5 lg:h-4 lg:w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </a>
            <div class="min-w-0 flex-1">
              <div class="flex items-center">
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                  <h1 class="text-xl font-bold break-words text-gray-900 lg:text-lg">
                    {props.trip()?.name || 'Packing'}
                  </h1>
                  <p class="text-xs text-gray-600">
                    {formatDateRange(props.trip()?.start_date, props.trip()?.end_date) ||
                      'No dates set'}
                  </p>
                </div>
                <button
                  onClick={props.onEditTrip}
                  class="flex-shrink-0 rounded p-1 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  title="Edit trip details"
                >
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </div>
              <Show
                when={props.showUnpackedOnly()}
                fallback={
                  <p class="text-xs text-gray-600">
                    {props.packedCount()} of {props.totalCount()} packed
                    <Show when={props.unpackedCount() > 0 && props.viewMode() === 'pack'}>
                      {' · '}
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          props.onToggleShowUnpackedOnly();
                        }}
                        class="text-blue-600 hover:text-blue-800 hover:underline"
                        title="Click to show only unpacked items"
                      >
                        {props.unpackedCount()} left to pack
                      </a>
                    </Show>
                  </p>
                }
              >
                <p class="text-xs">
                  <button
                    onClick={props.onToggleShowUnpackedOnly}
                    class="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 hover:bg-blue-200"
                    title="Click to show all items"
                  >
                    Showing {props.unpackedCount()} unpacked ✕
                  </button>
                </p>
              </Show>
            </div>
          </div>

          {/* Buttons row */}
          <div class="flex flex-shrink-0 items-stretch gap-2">
            <Show
              when={props.selectMode()}
              fallback={
                <>
                  <div class="relative flex" ref={searchContainerRef}>
                    <Button
                      variant={isSearchActive() || isSearchOpen() ? 'primary' : 'secondary'}
                      size="sm"
                      class="h-full"
                      onClick={() => (isSearchOpen() ? closeSearch() : openSearch())}
                      title="Search items"
                    >
                      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
                        />
                      </svg>
                    </Button>
                    <Show when={isSearchOpen()}>
                      <div
                        ref={searchOverlayRef}
                        class="fixed top-2 left-1/2 z-40 w-[min(90%,320px)] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg md:w-[min(70%,360px)]"
                      >
                        <div class="relative">
                          <input
                            ref={searchInputRef}
                            type="text"
                            inputmode="search"
                            value={props.searchQuery()}
                            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
                            placeholder="Search items..."
                            class="w-full appearance-none rounded-md border border-gray-200 py-1.5 pr-8 pl-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                          />
                          <Show when={props.searchQuery().trim().length > 0}>
                            <button
                              type="button"
                              onClick={() => props.onSearchChange('')}
                              class="absolute top-1/2 right-1 -translate-y-1/2 rounded-md px-1 py-0.5 text-xs font-semibold text-gray-500 transition hover:text-gray-900"
                              aria-label="Clear search"
                            >
                              ×
                            </button>
                          </Show>
                          <Show when={!props.searchQuery().trim()}>
                            <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-gray-300">
                              /
                            </span>
                          </Show>
                        </div>
                        <p class="mt-1 min-h-[1rem] text-[11px] text-gray-500">
                          {props.searchQuery().trim().length > 0
                            ? `${props.visibleItemCount()} of ${props.totalCount()}`
                            : '\u00A0'}
                        </p>
                      </div>
                    </Show>
                  </div>
                  {/* Mode toggle button - primary CTA */}
                  <Button variant="primary" size="sm" onClick={props.onToggleViewMode}>
                    {props.viewMode() === 'add' ? 'Start Packing' : 'Add More Items'}
                  </Button>
                  {/* Only show these in Pack mode */}
                  <Show when={props.viewMode() === 'pack'}>
                    <Button variant="secondary" size="sm" onClick={props.onManageBags}>
                      Bags
                    </Button>
                    <Button variant="secondary" size="sm" onClick={props.onAddItem}>
                      Quick Add
                    </Button>
                    <Button variant="secondary" size="sm" onClick={props.onToggleSelectMode}>
                      Select Batch
                    </Button>
                  </Show>
                  <Show when={props.viewMode() === 'pack'}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={props.onToggleSortBy}
                      title={`Currently sorting by ${props.sortBy()}. Click to switch.`}
                    >
                      <div class="text-center text-xs leading-tight">
                        <div class="text-[10px] text-gray-500">Sort:</div>
                        <div class="font-medium">
                          {props.sortBy() === 'bag' ? 'by Bag' : 'by Category'}
                        </div>
                      </div>
                    </Button>
                  </Show>
                  <div class="relative flex" ref={menuRef}>
                    <Button
                      variant="secondary"
                      size="sm"
                      class="h-full"
                      onClick={() => setShowMenu(!showMenu())}
                    >
                      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="2.5" />
                        <circle cx="12" cy="12" r="2.5" />
                        <circle cx="12" cy="19" r="2.5" />
                      </svg>
                    </Button>
                    <Show when={showMenu()}>
                      <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                        <a
                          href={`/trips/${props.trip()?.id}/print?sortBy=${props.sortBy()}`}
                          target="_blank"
                          onClick={() => setShowMenu(false)}
                          class="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          🖨️ Print Checklist
                        </a>
                        <button
                          onClick={() => {
                            props.onExport();
                            setShowMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          Export Trip
                        </button>
                        <button
                          onClick={() => {
                            props.onImport();
                            setShowMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          Import/Merge Trip
                        </button>
                        <button
                          onClick={() => {
                            props.onClearAll();
                            setShowMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100"
                        >
                          Clear All (Unpack)
                        </button>
                        <button
                          onClick={() => {
                            props.onDeleteTrip();
                            setShowMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100"
                        >
                          Delete Trip
                        </button>
                      </div>
                    </Show>
                  </div>
                </>
              }
            >
              <Button variant="secondary" size="sm" onClick={props.onToggleSelectMode}>
                Cancel
              </Button>
            </Show>
          </div>
        </div>

        {/* Progress Bar */}
        <div class="h-3 w-full rounded-full bg-gray-200">
          <div
            class="h-3 rounded-full bg-green-600 transition-all duration-300"
            style={{ width: `${props.progress()}%` }}
          />
        </div>
      </div>
    </header>
  );
}
