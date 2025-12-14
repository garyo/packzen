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
  onExport: () => void;
  onImport: () => void;
  onClearAll: () => void;
  onDeleteTrip: () => void;
}

export function PackingPageHeader(props: PackingPageHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu()) {
        setShowMenu(false);
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
        <div class="mb-3 md:mb-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <a href="/trips" class="flex items-center text-gray-600 hover:text-gray-900">
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
            <div>
              <h1 class="text-2xl md:text-lg font-bold text-gray-900">
                {props.trip()?.name || 'Packing'}
              </h1>
              <p class="text-sm md:text-xs text-gray-600">
                {props.packedCount()} of {props.totalCount()} packed
              </p>
            </div>
          </div>
          <div class="flex gap-2">
            <Show
              when={props.selectMode()}
              fallback={
                <>
                  <Button variant="secondary" size="sm" onClick={props.onManageBags}>
                    Bags
                  </Button>
                  <Button size="sm" onClick={props.onAddFromMaster}>
                    Add from All Items
                  </Button>
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
                  <Button variant="secondary" size="sm" onClick={props.onAddItem}>
                    Add New
                  </Button>
                  <div class="relative" ref={menuRef}>
                    <Button variant="secondary" size="sm" onClick={() => setShowMenu(!showMenu())}>
                      ⋮
                    </Button>
                    <Show when={showMenu()}>
                      <div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
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
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600"
                        >
                          Clear All (Unpack)
                        </button>
                        <button
                          onClick={() => {
                            props.onDeleteTrip();
                            setShowMenu(false);
                          }}
                          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600"
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
