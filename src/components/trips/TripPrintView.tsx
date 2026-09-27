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
import { fetchWithFallback } from '../../lib/resource-helpers';
import { formatDateRange } from '../../lib/utils';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { byName } from '../../lib/item-placement';

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

  // Fallbacks instead of throwing: an errored resource would blank the page.
  const [trip] = createResource(() =>
    fetchWithFallback<Trip | null>(
      () => api.get<Trip>(endpoints.trip(props.tripId)),
      null,
      'Failed to load trip'
    )
  );
  const [items] = createResource(() =>
    fetchWithFallback(
      () => api.get<TripItem[]>(endpoints.tripItems(props.tripId)),
      [],
      'Failed to load trip items'
    )
  );
  const [categories] = createResource(() =>
    fetchWithFallback(
      () => api.get<Category[]>(endpoints.categories),
      [],
      'Failed to load categories'
    )
  );
  const [bags] = createResource(() =>
    fetchWithFallback(
      () => api.get<Bag[]>(endpoints.tripBags(props.tripId)),
      [],
      'Failed to load bags'
    )
  );

  const getBagName = (bagId: string | null) =>
    (bagId && bags()?.find((b) => b.id === bagId)?.name) || null;

  // Items that should actually render, honoring the skipped-items toggle
  const visibleItems = () => {
    const itemsList = items() || [];
    return includeSkipped() ? itemsList : itemsList.filter((item) => !item.is_skipped);
  };

  const hasSkippedItems = () => (items() || []).some((item) => item.is_skipped);

  // Containers come from all items, not just visible ones: a skipped container
  // still heads the section for its contents that aren't skipped.
  const containersById = () =>
    new Map((items() || []).filter((item) => item.is_container).map((c) => [c.id, c]));

  // Get location label for an item (for category view)
  const getItemLocationLabel = (item: TripItem) => {
    const container = item.container_item_id
      ? containersById().get(item.container_item_id)
      : undefined;
    if (container) {
      const bagName = getBagName(container.bag_id);
      return bagName ? `${container.name} in ${bagName}` : container.name;
    }
    return getBagName(item.bag_id);
  };

  interface PrintGroup {
    key: string;
    title: string;
    items: TripItem[];
    containers: { container: TripItem; contents: TripItem[] }[];
  }

  // Bag view: one group per bag (by id, so two bags with the same name stay
  // apart), in the packing screen's bag order, with "Not in a bag" last.
  const groupByBag = (itemsList: TripItem[], categoriesList: Category[]): PrintGroup[] => {
    const bagsList = [...(bags() || [])].sort(byName);
    const knownBagIds = new Set(bagsList.map((b) => b.id));
    const groupKey = (bagId: string | null) => (bagId && knownBagIds.has(bagId) ? bagId : '');
    const containers = containersById();
    const isNested = (item: TripItem) =>
      !!item.container_item_id && containers.has(item.container_item_id);

    const categoryOrder = (item: TripItem) =>
      categoriesList.find((c) => c.name === (item.category_name || 'Uncategorized'))?.sort_order ||
      999;
    const byCategoryThenName = (a: TripItem, b: TripItem) =>
      categoryOrder(a) - categoryOrder(b) || byName(a, b);

    const visibleIds = new Set(itemsList.map((i) => i.id));
    const containerSections = [...containers.values()]
      .map((container) => ({
        container,
        contents: itemsList.filter((i) => i.container_item_id === container.id).sort(byName),
      }))
      .filter((section) => visibleIds.has(section.container.id) || section.contents.length > 0)
      .sort((a, b) => byName(a.container, b.container));

    return [
      ...bagsList.map((bag) => ({ key: bag.id, title: bag.name })),
      { key: '', title: NO_BAG_LABEL },
    ]
      .map(({ key, title }) => ({
        key,
        title,
        items: itemsList
          .filter((item) => !isNested(item) && groupKey(item.bag_id) === key)
          .sort(byCategoryThenName),
        containers: containerSections.filter((s) => groupKey(s.container.bag_id) === key),
      }))
      .filter((group) => group.items.length > 0 || group.containers.length > 0);
  };

  const groupByCategory = (itemsList: TripItem[], categoriesList: Category[]): PrintGroup[] => {
    const groups = new Map<string, TripItem[]>();
    for (const item of itemsList) {
      const categoryName = item.category_name || 'Uncategorized';
      groups.set(categoryName, [...(groups.get(categoryName) ?? []), item]);
    }
    const sortOrder = (name: string) =>
      categoriesList.find((c) => c.name === name)?.sort_order || 999;
    return [...groups.entries()]
      .sort(([a], [b]) => sortOrder(a) - sortOrder(b))
      .map(([title, groupItems]) => ({
        key: title,
        title,
        items: groupItems.sort(byName),
        containers: [],
      }));
  };

  const groupedItems = (): PrintGroup[] => {
    const categoriesList = categories();
    if (!items() || !categoriesList || !bags()) return [];
    return currentSortBy() === 'bag'
      ? groupByBag(visibleItems(), categoriesList)
      : groupByCategory(visibleItems(), categoriesList);
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
        }

        @media screen and (max-width: 640px) {
          .print-container {
            padding: 16px;
          }
        }

        .print-header {
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
        }

        .print-header-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: 4px 16px;
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
          min-width: 0;
          overflow-wrap: anywhere;
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
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 45%;
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

        .toolbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #fff;
          border-bottom: 1px solid #e5e7eb;
        }

        .back-link {
          margin-right: auto;
          color: #2563eb;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          white-space: nowrap;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .toolbar-button {
          padding: 8px 14px;
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s;
        }

        .toolbar-button:hover {
          background: #4b5563;
        }

        .toolbar-button.primary {
          background: #3b82f6;
        }

        .toolbar-button.primary:hover {
          background: #2563eb;
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
        }
      `}</style>

      <Show
        when={!trip.loading && !items.loading && !bags.loading && trip()}
        fallback={
          <div class="loading-container">
            <Show
              when={trip.loading || items.loading || bags.loading}
              fallback={
                <p>
                  Couldn't load this trip. <a href={`/trips/${props.tripId}/pack`}>Back to list</a>
                </p>
              }
            >
              <LoadingSpinner />
            </Show>
          </div>
        }
      >
        <div class="toolbar no-print">
          <a class="back-link" href={`/trips/${props.tripId}/pack`}>
            ← Back to list
          </a>
          <button
            class="toolbar-button"
            onClick={() => {
              const newSortBy = currentSortBy() === 'bag' ? 'category' : 'bag';
              window.location.href = buildPrintUrl({ sortBy: newSortBy });
            }}
          >
            {currentSortBy() === 'bag' ? '📁 By Category' : '👜 By Bag'}
          </button>
          <button
            class="toolbar-button"
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
              class="toolbar-button"
              onClick={() => {
                window.location.href = buildPrintUrl({ includeSkipped: !includeSkipped() });
              }}
            >
              {includeSkipped() ? '🙈 Hide Skipped' : '👁️ Show Skipped'}
            </button>
          </Show>
          <button class="toolbar-button primary" onClick={() => window.print()}>
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
              {({ title, items: groupItems, containers }) => (
                <div class="category-section">
                  <h2 class="category-header">{title}</h2>
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
                  <For each={containers}>
                    {({ container, contents }) => (
                      <div class="container-section">
                        <h3 class="container-header">
                          <span class="container-icon">📦</span>
                          {container.name}
                        </h3>
                        <Show
                          when={contents.length > 0}
                          fallback={<p class="container-empty">Empty</p>}
                        >
                          <For each={contents}>
                            {(item) => <ItemRow item={item} locationLabel={item.category_name} />}
                          </For>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}
