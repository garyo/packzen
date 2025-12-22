/**
 * TripPrintView Component
 *
 * Printer-friendly view of a trip with checkboxes for packing
 * Supports both bag-first and category-first sorting
 */

import { createResource, Show, For, createSignal } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Category, Bag } from '../../lib/types';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { fetchWithErrorHandling, fetchSingleWithErrorHandling } from '../../lib/resource-helpers';

interface TripPrintViewProps {
  tripId: string;
  sortBy?: 'bag' | 'category';
  initialColumns?: number;
}

export function TripPrintView(props: TripPrintViewProps) {
  const [twoColumn, setTwoColumn] = createSignal((props.initialColumns || 1) === 2);

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

  // Group items based on sort preference
  const groupedItems = () => {
    const itemsList = items();
    const categoriesList = categories();
    const bagsList = bags();
    if (!itemsList || !categoriesList || !bagsList) return [];

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

      // Distribute items
      itemsList.forEach((item) => {
        const bagName = getBagName(item.bag_id) || 'No Bag';
        groups.get(bagName)!.push(item);
      });

      // Convert to array and filter out empty groups
      return Array.from(groups.entries())
        .filter(([_, items]) => items.length > 0)
        .map(([groupName, groupItems]) => ({
          groupName,
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
        }));
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
          items: groupItems.sort((a, b) => a.name.localeCompare(b.name)),
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
        }

        .print-header {
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 15px;
        }

        .print-title {
          font-size: 24px;
          font-weight: bold;
          margin: 0 0 8px 0;
        }

        .print-date {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .items-container.two-column {
          column-count: 2;
          column-gap: 40px;
        }

        .category-section {
          margin-bottom: 25px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .category-header {
          font-size: 18px;
          font-weight: bold;
          margin: 0 0 10px 0;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
        }

        .item-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px dotted #ddd;
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
              const newSortBy = props.sortBy === 'bag' ? 'category' : 'bag';
              const columns = twoColumn() ? 2 : 1;
              window.location.href = `/trips/${props.tripId}/print?sortBy=${newSortBy}&columns=${columns}`;
            }}
          >
            {props.sortBy === 'bag' ? '📁 Sort by Category' : '👜 Sort by Bag'}
          </button>
          <button
            class="sort-button"
            onClick={() => {
              const newColumns = twoColumn() ? 1 : 2;
              const sortBy = props.sortBy || 'bag';
              window.location.href = `/trips/${props.tripId}/print?sortBy=${sortBy}&columns=${newColumns}`;
            }}
          >
            {twoColumn() ? '📄 1 Column' : '📄 2 Columns'}
          </button>
          <button class="print-button" onClick={() => window.print()}>
            🖨️ Print
          </button>
        </div>

        <div class="print-container">
          <div class="print-header">
            <h1 class="print-title">{trip()?.name}</h1>
            <p class="print-date">
              {trip()?.start_date && (
                <>
                  {new Date(trip()!.start_date!).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {trip()?.end_date && (
                    <>
                      {' - '}
                      {new Date(trip()!.end_date!).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <div class={twoColumn() ? 'items-container two-column' : 'items-container'}>
            <For each={groupedItems()}>
              {({ groupName, items: groupItems }) => (
                <div class="category-section">
                  <h2 class="category-header">{groupName}</h2>
                  <For each={groupItems}>
                    {(item) => (
                      <div>
                        <div class="item-row">
                          <span class={item.is_packed ? 'checkbox checked' : 'checkbox'}></span>
                          <span class="item-name">{item.name}</span>
                          {item.quantity > 1 && <span class="item-quantity">×{item.quantity}</span>}
                          {props.sortBy === 'bag' && item.category_name && (
                            <span class="item-bag">{item.category_name}</span>
                          )}
                          {props.sortBy === 'category' && item.bag_id && (
                            <span class="item-bag">{getBagName(item.bag_id)}</span>
                          )}
                        </div>
                        {item.notes && <div class="item-notes">{item.notes}</div>}
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
