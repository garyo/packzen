/**
 * PackingPageHeader Component
 *
 * Header with progress bar, trip info, and action buttons
 * Extracted from PackingPage for better separation of concerns
 */

import { Show, type Accessor, onMount, onCleanup } from 'solid-js';
import type { Trip } from '../../lib/types';
import { Button } from '../ui/Button';
import { createSignal } from 'solid-js';

interface PackingPageHeaderProps {
  trip: Accessor<Trip | null | undefined>;
  packedCount: Accessor<number>;
  totalCount: Accessor<number>;
  progress: Accessor<number>;
  selectMode: Accessor<boolean>;
  sortBy: Accessor<'bag' | 'category'>;
  onToggleSelectMode: () => void;
  onToggleSortBy: () => void;
  onAddItem: () => void;
  onManageBags: () => void;
  onAddFromMaster: () => void;
  onBrowseTemplates: () => void;
  onExport: () => void;
  onImport: () => void;
  onClearAll: () => void;
  onDeleteTrip: () => void;
}

export function PackingPageHeader(props: PackingPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [showAddMenu, setShowAddMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let addMenuRef: HTMLDivElement | undefined;

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
      if (showAddMenu() && addMenuRef && !addMenuRef.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMenu()) setShowMenu(false);
        if (showAddMenu()) setShowAddMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  return (
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div class="container mx-auto px-4 py-4 md:py-2">
        {/* Two-row layout on mobile, single row on desktop */}
        <div class="mb-3 flex flex-col gap-2 md:mb-2 md:flex-row md:items-center md:justify-between">
          {/* Title row */}
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <a
              href="/dashboard"
              class="flex flex-shrink-0 items-center text-gray-600 hover:text-gray-900"
              title="Home"
            >
              <svg
                class="h-6 w-6 md:h-5 md:w-5"
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
                class="h-5 w-5 md:h-4 md:w-4"
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
              <h1 class="truncate text-xl font-bold text-gray-900 md:text-lg">
                {props.trip()?.name || 'Packing'}
              </h1>
              <p class="text-xs text-gray-600">
                {props.packedCount()} of {props.totalCount()} packed
              </p>
            </div>
          </div>

          {/* Buttons row */}
          <div class="flex flex-shrink-0 gap-2">
            <Show
              when={props.selectMode()}
              fallback={
                <>
                  <Button variant="secondary" size="sm" onClick={props.onManageBags}>
                    Bags
                  </Button>
                  <div class="relative" ref={addMenuRef}>
                    <Button size="sm" onClick={() => setShowAddMenu(!showAddMenu())}>
                      Add Items...
                    </Button>
                    <Show when={showAddMenu()}>
                      <div class="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
                        <button
                          onClick={() => {
                            props.onAddFromMaster();
                            setShowAddMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          📋 Add from My Items
                        </button>
                        <button
                          onClick={() => {
                            props.onBrowseTemplates();
                            setShowAddMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          📚 Browse Templates
                        </button>
                        <button
                          onClick={() => {
                            props.onAddItem();
                            setShowAddMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          ✏️ Add New Item
                        </button>
                      </div>
                    </Show>
                  </div>
                  <Button variant="secondary" size="sm" onClick={props.onToggleSelectMode}>
                    Select
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={props.onToggleSortBy}
                    title={`Currently sorting by ${props.sortBy()}. Click to switch.`}
                  >
                    {props.sortBy() === 'bag' ? '👜→📁' : '📁→👜'}
                  </Button>
                  <div class="relative" ref={menuRef}>
                    <Button variant="secondary" size="sm" onClick={() => setShowMenu(!showMenu())}>
                      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </Button>
                    <Show when={showMenu()}>
                      <div class="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                        <a
                          href={`/trips/${props.trip()?.id}/print?sortBy=${props.sortBy()}`}
                          target="_blank"
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
