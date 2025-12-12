import { createSignal, createResource, For, Show, onMount } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Trip, TripItem, Bag } from '../../lib/types';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Toast, showToast } from '../ui/Toast';
import { getPackingProgress } from '../../lib/utils';
import { AddFromMasterList } from './AddFromMasterList';
import { BagManager } from './BagManager';
import { EditTripItem } from './EditTripItem';
import { AddTripItemForm } from './AddTripItemForm';

interface PackingPageProps {
  tripId: string;
}

export function PackingPage(props: PackingPageProps) {
  const [showAddFromMaster, setShowAddFromMaster] = createSignal(false);
  const [showBagManager, setShowBagManager] = createSignal(false);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<TripItem | null>(null);

  const [items, { mutate, refetch }] = createResource<TripItem[]>(async () => {
    const response = await api.get<TripItem[]>(endpoints.tripItems(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const [trip] = createResource<Trip>(async () => {
    const response = await api.get<Trip>(endpoints.trip(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error('Trip not found');
  });

  const [bags] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  onMount(async () => {
    await authStore.initAuth();
  });

  const handleTogglePacked = async (item: TripItem) => {
    // Optimistic update
    mutate((prev) =>
      prev?.map((i) => (i.id === item.id ? { ...i, is_packed: !i.is_packed } : i))
    );

    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: item.id,
      is_packed: !item.is_packed,
    });

    if (!response.success) {
      showToast('error', response.error || 'Failed to update item');
      refetch(); // Revert on error
    }
  };

  const handleAddItem = () => {
    setShowAddForm(true);
  };

  const packedCount = () => items()?.filter((i) => i.is_packed).length || 0;
  const totalCount = () => items()?.length || 0;
  const progress = () => getPackingProgress(packedCount(), totalCount());

  const itemsByBag = () => {
    const allItems = items() || [];
    const allBags = bags() || [];
    const grouped = new Map<string | null, TripItem[]>();

    // Group items by bag_id
    allItems.forEach((item) => {
      const bagId = item.bag_id || null;
      if (!grouped.has(bagId)) {
        grouped.set(bagId, []);
      }
      grouped.get(bagId)!.push(item);
    });

    return { grouped, allBags };
  };

  return (
    <div class="min-h-screen bg-gray-50">
      <Toast />

      {/* Header with Progress */}
      <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h1 class="text-2xl font-bold text-gray-900">{trip()?.name || 'Packing'}</h1>
              <p class="text-sm text-gray-600">
                {packedCount()} of {totalCount()} packed
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowBagManager(true)}>
                Bags
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowAddFromMaster(true)}>
                + From Master
              </Button>
              <Button size="sm" onClick={handleAddItem}>
                + Add
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div
              class="bg-green-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress()}%` }}
            />
          </div>
        </div>
      </header>

      {/* Packing List */}
      <main class="container mx-auto px-4 py-6 pb-20">
        <Show when={!items.loading} fallback={<LoadingSpinner text="Loading items..." />}>
          <Show
            when={totalCount() > 0}
            fallback={
              <EmptyState
                icon="📦"
                title="No items yet"
                description="Add items to your packing list to get started"
                action={<Button onClick={handleAddItem}>Add First Item</Button>}
              />
            }
          >
            <div class="space-y-6">
              {/* Items grouped by bag */}
              <For each={itemsByBag().allBags}>
                {(bag) => {
                  const bagItems = () => itemsByBag().grouped.get(bag.id) || [];
                  return (
                    <Show when={bagItems().length > 0}>
                      <div class="space-y-2">
                        <div class="flex items-center gap-2 mb-3">
                          <div
                            class={`w-3 h-3 rounded-full ${
                              bag.color === 'blue' ? 'bg-blue-500' :
                              bag.color === 'red' ? 'bg-red-500' :
                              bag.color === 'green' ? 'bg-green-500' :
                              bag.color === 'yellow' ? 'bg-yellow-500' :
                              bag.color === 'purple' ? 'bg-purple-500' :
                              bag.color === 'black' ? 'bg-black' :
                              'bg-gray-500'
                            }`}
                          />
                          <h2 class="text-lg font-semibold text-gray-900">{bag.name}</h2>
                          <span class="text-sm text-gray-500">({bagItems().length})</span>
                        </div>
                        <For each={bagItems()}>
                          {(item) => (
                            <div
                              class={`
                                flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm
                                ${item.is_packed ? 'opacity-60' : ''}
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={item.is_packed}
                                onChange={() => handleTogglePacked(item)}
                                class="h-8 w-8 rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 cursor-pointer"
                              />
                              <div class="flex-1">
                                <p class={`font-medium text-lg ${item.is_packed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                  {item.name}
                                </p>
                                <div class="flex gap-3 mt-1 text-sm text-gray-500">
                                  {item.category_name && <span>📁 {item.category_name}</span>}
                                  {item.quantity > 1 && <span>×{item.quantity}</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => setEditingItem(item)}
                                class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                aria-label="Edit item"
                              >
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  );
                }}
              </For>

              {/* Items not in any bag */}
              <Show when={(itemsByBag().grouped.get(null)?.length || 0) > 0}>
                <div class="space-y-2">
                  <h2 class="text-lg font-semibold text-gray-900 mb-3">
                    Not in a bag ({itemsByBag().grouped.get(null)?.length || 0})
                  </h2>
                  <For each={itemsByBag().grouped.get(null)}>
                    {(item) => (
                      <div
                        class={`
                          flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm
                          ${item.is_packed ? 'opacity-60' : ''}
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={item.is_packed}
                          onChange={() => handleTogglePacked(item)}
                          class="h-8 w-8 rounded border-2 border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 cursor-pointer"
                        />
                        <div class="flex-1">
                          <p class={`font-medium text-lg ${item.is_packed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {item.name}
                          </p>
                          <div class="flex gap-3 mt-1 text-sm text-gray-500">
                            {item.category_name && <span>📁 {item.category_name}</span>}
                            {item.quantity > 1 && <span>×{item.quantity}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingItem(item)}
                          class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          aria-label="Edit item"
                        >
                          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </main>

      {/* Add Item Form Modal */}
      <Show when={showAddForm()}>
        <AddTripItemForm
          tripId={props.tripId}
          onClose={() => setShowAddForm(false)}
          onSaved={() => refetch()}
        />
      </Show>

      {/* Edit Item Modal */}
      <Show when={editingItem()}>
        <EditTripItem
          tripId={props.tripId}
          item={editingItem()!}
          onClose={() => setEditingItem(null)}
          onSaved={() => refetch()}
        />
      </Show>

      {/* Bag Manager Modal */}
      <Show when={showBagManager()}>
        <BagManager
          tripId={props.tripId}
          onClose={() => setShowBagManager(false)}
          onSaved={() => refetch()}
        />
      </Show>

      {/* Add from Master List Modal */}
      <Show when={showAddFromMaster()}>
        <AddFromMasterList
          tripId={props.tripId}
          onClose={() => setShowAddFromMaster(false)}
          onAdded={() => refetch()}
        />
      </Show>

      {/* Back Button */}
      <div class="fixed bottom-4 left-4">
        <a
          href="/trips"
          class="inline-flex items-center gap-2 px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-lg hover:bg-gray-50"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </a>
      </div>
    </div>
  );
}
