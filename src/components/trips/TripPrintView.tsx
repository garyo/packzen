/**
 * TripPrintView Component
 *
 * Printer-friendly view of a trip with checkboxes for packing
 * Supports both bag-first and category-first sorting
 */

import { createResource, Show, For, createSignal, onMount } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Category, Bag } from '../../lib/types';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';
import { formatDateRange } from '../../lib/utils';

// One printed checklist line, shared by the top-level item list and the
// container-contents list.
function ItemRow(props: { item: TripItem; locationLabel?: string | null }) {
  return (
    <div class="item-wrapper">
      <div class="item-row">
        <span class={props.item.is_packed ? 'checkbox checked' : 'checkbox'}></span>
        <span class={props.item.is_skipped ? 'item-name skipped' : 'item-name'}>
          {props.item.name}
        </span>
        {props.item.is_skipped && <span class="item-skipped-badge">Skipped</span>}
        {props.item.quantity > 1 && <span class="item-quantity">×{props.item.quantity}</span>}
        {props.locationLabel && <span class="item-bag">{props.locationLabel}</span>}
      </div>
      {props.item.notes && <div class="item-notes">{props.item.notes}</div>}
    </div>
  );
}

export const PRINT_COLUMNS_STORAGE_KEY = 'packzen-print-columns';

interface TripPrintViewProps {
  tripId: string;
  sortBy?: 'bag' | 'category';
  initialColumns?: number;
  initialIncludeSkipped?: boolean;
}

export function TripPrintView(props: TripPrintViewProps) {
  const [twoColumn] = createSignal((props.initialColumns || 1) === 2);
  const [includeSkipped] = createSignal(props.initialIncludeSkipped || false);

  const currentSortBy = () => props.sortBy || 'bag';

  const buildPrintUrl = (overrides: {
    sortBy?: 'bag' | 'category';
    columns?: number;
    includeSkipped?: boolean;
  }) => {
    const params = new URLSearchParams({
      sortBy: overrides.sortBy ?? currentSortBy(),
      columns: String(overrides.columns ?? (twoColumn() ? 2 : 1)),
      includeSkipped: (overrides.includeSkipped ?? includeSkipped()) ? '1' : '0',
    });
    return `/trips/${props.tripId}/print?${params.toString()}`;
  };

  // Best-effort analytics beacon: record that the print/checklist view loaded.
  onMount(() => {
    void api.post(endpoints.analytics, {
      event: 'list_printed',
      props: { tripId: props.tripId },
    });
  });

  const [trip] = createResource<Trip | null>(async () => {
    return fetchSingleWithErrorHandling(
      () => api.get<Trip>(endpoints.trip(props.tripId)),
      'Failed to load trip'
    );
  });

  const [items] = createResource<TripItem[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<TripItem[]>(endpoints.tripItems(props.tripId)),
      'Failed to load trip items'
    );
  });

  const [categories] = createResource<Category[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Category[]>(endpoints.categories),
      'Failed to load categories'
    );
  });

  const [bags] = createResource<Bag[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<Bag[]>(endpoints.tripBags(props.tripId)),
      'Failed to load bags'
    );
  });

  // Get bag name by ID
  const getBagName = (bagId: string | null) => {
    if (!bagId) return null;
    const bag = bags()?.find((b) => b.id === bagId);
    return bag?.name || null;
  };

  // Items that should actually render, honoring the skipped-items toggle
  const visibleItems = () => {
    const itemsList = items() || [];
    return includeSkipped() ? itemsList : itemsList.filter((item) => !item.is_skipped);
  };

  const hasSkippedItems = () => (items() || []).some((item) => item.is_skipped);

  // Get container data - containers and their contents
  const containerData = () => {
    const itemsList = visibleItems();
    const containers = itemsList.filter((item) => item.is_container);
    const containedItems = new Map<string, TripItem[]>();

    // Group items by their container
    itemsList.forEach((item) => {
      if (item.container_item_id) {
        if (!containedItems.has(item.container_item_id)) {
          containedItems.set(item.container_item_id, []);
        }
        containedItems.get(item.container_item_id)!.push(item);
      }
    });

    return { containers, containedItems };
  };

  // Get containers in a specific bag
  const getContainersInBag = (bagId: string | null) => {
    const { containers } = containerData();
    return containers
      .filter((c) => c.bag_id === bagId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get contents of a container
  const getContainerContents = (containerId: string) => {
    return containerData().containedItems.get(containerId) || [];
  };

  // Get container name by ID
  const getContainerName = (containerId: string | null) => {
    if (!containerId) return null;
    const container = containerData().containers.find((c) => c.id === containerId);
    return container?.name || null;
  };

  // Get location label for an item (for category view)
  const getItemLocationLabel = (item: TripItem) => {
    if (item.container_item_id) {
      const containerName = getContainerName(item.container_item_id);
      const container = containerData().containers.find((c) => c.id === item.container_item_id);
      const bagName = container ? getBagName(container.bag_id) : null;
      if (containerName && bagName) {
        return `${containerName} in ${bagName}`;
      }
      return containerName || bagName || null;
    }
    return getBagName(item.bag_id);
  };

  // Group items based on sort preference
  const groupedItems = () => {
    const categoriesList = categories();
    const bagsList = bags();
    if (!items() || !categoriesList || !bagsList) return [];
    const itemsList = visibleItems();

    const sortBy = props.sortBy || 'bag';

    if (sortBy === 'bag') {
      // Group by bag first
      const groups = new Map<string, TripItem[]>();

      // Add "No Bag" group
      groups.set('No Bag', []);

      // Add all bags
      bagsList.forEach((bag) => {
        groups.set(bag.name, []);
      });

      // Distribute items - EXCLUDE items that are inside containers
      itemsList
        .filter((item) => !item.container_item_id)
        .forEach((item) => {
          const bagName = getBagName(item.bag_id) || 'No Bag';
          groups.get(bagName)!.push(item);
        });

      // Convert to array and filter out empty groups (but keep groups with containers)
      // Sort alphabetically, but put "No Bag" at the end
      return Array.from(groups.entries())
        .filter(([groupName, groupItems]) => {
          if (groupItems.length > 0) return true;
          // Also keep bag if it has containers
          const bag = bagsList.find((b) => b.name === groupName);
          if (bag) {
            return getContainersInBag(bag.id).length > 0;
          }
          return getContainersInBag(null).length > 0 && groupName === 'No Bag';
        })
        .sort(([nameA], [nameB]) => {
          // "No Bag" always goes to the end
          if (nameA === 'No Bag') return 1;
          if (nameB === 'No Bag') return -1;
          return nameA.localeCompare(nameB);
        })
        .map(([groupName, groupItems]) => {
          // Find bag ID for this group
          const bag = bagsList.find((b) => b.name === groupName);
          const bagId = bag?.id ?? null;

          return {
            groupName,
            bagId,
            items: groupItems.sort((a, b) => {
              // Sort by category first, then by name
              const catA = a.category_name || 'Uncategorized';
              const catB = b.category_name || 'Uncategorized';
              if (catA !== catB) {
                const categoryA = categoriesList.find((c) => c.name === catA);
                const categoryB = categoriesList.find((c) => c.name === catB);
                return (categoryA?.sort_order || 999) - (categoryB?.sort_order || 999);
              }
              return a.name.localeCompare(b.name);
            }),
            containers: getContainersInBag(bagId),
          };
        });
    } else {
      // Group by category first
      const groups = new Map<string, TripItem[]>();

      itemsList.forEach((item) => {
        const categoryName = item.category_name || 'Uncategorized';
        if (!groups.has(categoryName)) {
          groups.set(categoryName, []);
        }
        groups.get(categoryName)!.push(item);
      });

      // Sort categories by their sort_order
      return Array.from(groups.entries())
        .sort(([catA], [catB]) => {
          const categoryA = categoriesList.find((c) => c.name === catA);
          const categoryB = categoriesList.find((c) => c.name === catB);
          return (categoryA?.sort_order || 999) - (categoryB?.sort_order || 999);
        })
        .map(([groupName, groupItems]) => ({
          groupName,
          bagId: null as string | null,
          items: groupItems.sort((a, b) => a.name.localeCompare(b.name)),
          containers: [] as TripItem[],
        }));
    }
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            margin: 0.75in;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          line-height: 1.5;
          color: #000;
          background: #fff;
        }

        .print-container {
          max-width: 8.5in;
          margin: 0 auto;
          padding: 20px;
          padding-top: 60px;
        }

        @media print {
          .print-container {
            padding-top: 20px;
          }
        }

        .print-header {
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
        }

        .print-header-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }

        .print-title {
          font-size: 24px;
          font-weight: bold;
          margin: 0;
        }

        .print-destination {
          font-size: 13px;
          color: #555;
          margin: 4px 0 0 0;
        }

        .print-date {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .print-trip-notes {
          font-size: 12px;
          color: #444;
          font-style: italic;
          margin: 10px 0 0 0;
        }

        .items-container.two-column {
          column-count: 2;
          column-gap: 40px;
        }

        .category-section {
          margin-bottom: 25px;
        }

        .category-header {
          font-size: 18px;
          font-weight: bold;
          margin: 0 0 10px 0;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          break-after: avoid;
        }

        .item-wrapper {
          border-bottom: 1px dotted #ddd;
          padding-bottom: 2px;
          break-inside: avoid;
        }

        .item-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-top: 6px;
        }

        .checkbox {
          width: 16px;
          height: 16px;
          min-width: 16px;
          border: 2px solid #333;
          border-radius: 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .checkbox.checked {
          background: #333;
        }

        .checkbox.checked::after {
          content: '✓';
          color: white;
          font-size: 12px;
          font-weight: bold;
          line-height: 1;
        }

        .item-name {
          flex: 1;
          font-size: 13px;
          font-weight: normal;
        }

        .item-name.skipped {
          text-decoration: line-through;
          color: #999;
        }

        .item-skipped-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #9ca3af;
          border: 1px solid #d1d5db;
          padding: 1px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .item-quantity {
          font-size: 12px;
          color: #666;
          min-width: 40px;
          text-align: right;
        }

        .item-bag {
          font-size: 11px;
          color: #666;
          background: #f3f4f6;
          padding: 2px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .item-notes {
          font-size: 11px;
          color: #666;
          font-style: italic;
          margin-left: 26px;
          margin-top: 2px;
        }

        .container-section {
          margin-top: 15px;
          margin-left: 20px;
          padding-left: 15px;
          border-left: 2px solid #93c5fd;
        }

        .container-header {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1e40af;
          display: flex;
          align-items: center;
          gap: 6px;
          break-after: avoid;
        }

        .container-icon {
          font-size: 12px;
        }

        .container-empty {
          font-size: 12px;
          color: #9ca3af;
          font-style: italic;
        }

        .action-buttons {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          gap: 10px;
        }

        .print-button,
        .sort-button {
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          transition: background 0.2s;
        }

        .print-button:hover,
        .sort-button:hover {
          background: #2563eb;
        }

        .sort-button {
          background: #6b7280;
        }

        .sort-button:hover {
          background: #4b5563;
        }

        @media print {
          .action-buttons {
            display: none;
          }
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
        }
      `}</style>

      <Show
        when={!trip.loading && !items.loading && !bags.loading && trip() && items() && bags()}
        fallback={
          <div class="loading-container">
            <LoadingSpinner />
          </div>
        }
      >
        <div class="action-buttons no-print">
          <button
            class="sort-button"
            onClick={() => {
              const newSortBy = currentSortBy() === 'bag' ? 'category' : 'bag';
              window.location.href = buildPrintUrl({ sortBy: newSortBy });
            }}
          >
            {currentSortBy() === 'bag' ? '📁 Sort by Category' : '👜 Sort by Bag'}
          </button>
          <button
            class="sort-button"
            onClick={() => {
              const newColumns = twoColumn() ? 1 : 2;
              window.localStorage.setItem(PRINT_COLUMNS_STORAGE_KEY, String(newColumns));
              window.location.href = buildPrintUrl({ columns: newColumns });
            }}
          >
            {twoColumn() ? '📄 1 Column' : '📄 2 Columns'}
          </button>
          <Show when={hasSkippedItems()}>
            <button
              class="sort-button"
              onClick={() => {
                window.location.href = buildPrintUrl({ includeSkipped: !includeSkipped() });
              }}
            >
              {includeSkipped() ? '🙈 Hide Skipped' : '👁️ Show Skipped'}
            </button>
          </Show>
          <button class="print-button" onClick={() => window.print()}>
            🖨️ Print
          </button>
        </div>

        <div class="print-container">
          <div class="print-header">
            <div class="print-header-row">
              <div>
                <h1 class="print-title">{trip()?.name}</h1>
                <Show when={trip()?.destination}>
                  <p class="print-destination">📍 {trip()?.destination}</p>
                </Show>
              </div>
              <p class="print-date">{formatDateRange(trip()?.start_date, trip()?.end_date)}</p>
            </div>
            <Show when={trip()?.notes}>
              <p class="print-trip-notes">{trip()?.notes}</p>
            </Show>
          </div>

          <div class={twoColumn() ? 'items-container two-column' : 'items-container'}>
            <For each={groupedItems()}>
              {({ groupName, items: groupItems, containers }) => (
                <div class="category-section">
                  <h2 class="category-header">{groupName}</h2>
                  <For each={groupItems}>
                    {(item) => (
                      <ItemRow
                        item={item}
                        locationLabel={
                          currentSortBy() === 'bag'
                            ? item.category_name
                            : item.bag_id || item.container_item_id
                              ? getItemLocationLabel(item)
                              : null
                        }
                      />
                    )}
                  </For>
                  {/* Container sections within this bag */}
                  <Show when={currentSortBy() === 'bag' && containers.length > 0}>
                    <For each={containers}>
                      {(container) => {
                        const contents = getContainerContents(container.id);
                        return (
                          <div class="container-section">
                            <h3 class="container-header">
                              <span class="container-icon">📦</span>
                              {container.name}
                            </h3>
                            <Show
                              when={contents.length > 0}
                              fallback={<p class="container-empty">Empty</p>}
                            >
                              <For each={contents.sort((a, b) => a.name.localeCompare(b.name))}>
                                {(item) => (
                                  <ItemRow item={item} locationLabel={item.category_name} />
                                )}
                              </For>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}
