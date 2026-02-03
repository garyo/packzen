import { createSignal, createResource, createMemo, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag, BagTemplate, TripItem } from '../../lib/types';
import { BAG_TYPES } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';

interface ReplaceBagModalProps {
  tripId: string;
  currentBag: Bag;
  tripBags?: Bag[];
  onClose: () => void;
  onReplaced: () => void;
}

const BAG_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
  { value: 'black', label: 'Black', class: 'bg-black' },
  { value: 'white', label: 'White', class: 'bg-white' },
];

export function ReplaceBagModal(props: ReplaceBagModalProps) {
  const [showCustomForm, setShowCustomForm] = createSignal(false);
  const [formData, setFormData] = createSignal({
    name: '',
    type: 'carry_on' as const,
    color: 'blue',
  });

  const [saving, setSaving] = createSignal(false);

  const [bagTemplates] = createResource<BagTemplate[]>(async () => {
    const response = await api.get<BagTemplate[]>(endpoints.bagTemplates);
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  // Filter saved templates to exclude ones matching existing trip bag names
  const filteredTemplates = createMemo(() => {
    const templates = bagTemplates() || [];
    const existingNames = new Set((props.tripBags || []).map((b) => b.name.toLowerCase()));
    return templates.filter((t) => !existingNames.has(t.name.toLowerCase()));
  });

  // Other bags in this trip (excluding the current one) as merge targets
  const otherTripBags = createMemo(() => {
    return (props.tripBags || []).filter((b) => b.id !== props.currentBag.id);
  });

  const replaceWithValues = async (name: string, type: string, color: string | null) => {
    if (saving()) return;
    setSaving(true);
    const response = await api.patch(endpoints.tripBags(props.tripId), {
      bag_id: props.currentBag.id,
      name,
      type,
      color,
    });

    if (response.success) {
      showToast('success', `Replaced with ${name}`);
      props.onReplaced();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to replace bag');
      setSaving(false);
    }
  };

  const mergeIntoBag = async (targetBag: Bag) => {
    if (saving()) return;
    setSaving(true);

    // Fetch current trip items to find which ones need moving
    const itemsResponse = await api.get<TripItem[]>(endpoints.tripItems(props.tripId));
    if (!itemsResponse.success || !itemsResponse.data) {
      showToast('error', 'Failed to load items');
      setSaving(false);
      return;
    }

    const itemsToMove = itemsResponse.data.filter((i) => i.bag_id === props.currentBag.id);

    // Move each item to the target bag (preserve container_item_id)
    if (itemsToMove.length > 0) {
      const moveResults = await Promise.allSettled(
        itemsToMove.map((item) =>
          api.patch(endpoints.tripItems(props.tripId), {
            id: item.id,
            bag_id: targetBag.id,
            container_item_id: item.container_item_id,
          })
        )
      );

      const failCount = moveResults.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      ).length;

      if (failCount > 0) {
        showToast('error', `Failed to move ${failCount} item(s)`);
        setSaving(false);
        return;
      }
    }

    // Delete the now-empty source bag
    const deleteResponse = await api.delete(endpoints.tripBags(props.tripId), {
      body: JSON.stringify({ bag_id: props.currentBag.id }),
    });

    if (deleteResponse.success) {
      const countText = itemsToMove.length === 1 ? '1 item' : `${itemsToMove.length} items`;
      showToast('success', `Moved ${countText} to ${targetBag.name}`);
      props.onReplaced();
      props.onClose();
    } else {
      showToast('error', 'Items moved but failed to remove old bag');
      props.onReplaced();
      setSaving(false);
    }
  };

  const handleSelectTemplate = (template: BagTemplate) => {
    replaceWithValues(template.name, template.type, template.color);
  };

  const handleCustomSubmit = (e: Event) => {
    e.preventDefault();
    const data = formData();
    if (!data.name.trim()) {
      showToast('error', 'Bag name is required');
      return;
    }
    replaceWithValues(data.name.trim(), data.type, data.color);
  };

  return (
    <Modal title={`Replace "${props.currentBag.name}"`} onClose={props.onClose}>
      <p class="mb-4 text-sm text-gray-500">
        Choose a replacement bag or move items into an existing bag.
      </p>

      {/* Saved bag templates (filtered to exclude bags already in trip) */}
      <Show when={!bagTemplates.loading && filteredTemplates().length > 0}>
        <div class="mb-4">
          <h3 class="mb-2 text-sm font-semibold text-gray-900">Replace with saved bag</h3>
          <div class="grid grid-cols-2 gap-2">
            <For each={filteredTemplates()}>
              {(template) => (
                <button
                  disabled={saving()}
                  onClick={() => handleSelectTemplate(template)}
                  class="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50"
                >
                  <div
                    class={`h-4 w-4 flex-shrink-0 rounded-full border border-gray-300 ${
                      BAG_COLORS.find((c) => c.value === template.color)?.class || 'bg-gray-500'
                    }`}
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-gray-900">{template.name}</p>
                    <p class="truncate text-xs text-gray-500">
                      {BAG_TYPES.find((t) => t.type === template.type)?.label || template.type}
                    </p>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={bagTemplates.loading}>
        <div class="mb-4">
          <LoadingSpinner text="Loading saved bags..." />
        </div>
      </Show>

      {/* Move items to existing trip bag */}
      <Show when={otherTripBags().length > 0}>
        <div class="mb-4 border-t border-gray-200 pt-4">
          <h3 class="mb-2 text-sm font-semibold text-gray-900">Move items to existing bag</h3>
          <div class="grid grid-cols-2 gap-2">
            <For each={otherTripBags()}>
              {(bag) => (
                <button
                  disabled={saving()}
                  onClick={() => mergeIntoBag(bag)}
                  class="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-left hover:border-green-500 hover:bg-green-50 disabled:opacity-50"
                >
                  <div
                    class={`h-4 w-4 flex-shrink-0 rounded-full border border-gray-300 ${
                      BAG_COLORS.find((c) => c.value === bag.color)?.class || 'bg-gray-500'
                    }`}
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-gray-900">{bag.name}</p>
                    <p class="truncate text-xs text-gray-500">
                      {BAG_TYPES.find((t) => t.type === bag.type)?.label || bag.type}
                    </p>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Custom bag form */}
      <div class="border-t border-gray-200 pt-4">
        <Show
          when={showCustomForm()}
          fallback={
            <Button onClick={() => setShowCustomForm(true)} variant="secondary" size="sm">
              Replace with New Bag
            </Button>
          }
        >
          <form onSubmit={handleCustomSubmit} class="space-y-3">
            <h3 class="text-sm font-semibold text-gray-900">Replace with New Bag</h3>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag Type</label>
              <select
                value={formData().type}
                onChange={(e) => setFormData({ ...formData(), type: e.target.value as any })}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <For each={BAG_TYPES}>
                  {(type) => (
                    <option value={type.type}>
                      {type.label} - {type.description}
                    </option>
                  )}
                </For>
              </select>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag Name</label>
              <Input
                type="text"
                value={formData().name}
                onInput={(e) => setFormData({ ...formData(), name: e.currentTarget.value })}
                placeholder="e.g., Red Suitcase"
              />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Color</label>
              <div class="flex gap-2">
                <For each={BAG_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData(), color: color.value })}
                      class={`h-8 w-8 rounded-full border border-gray-300 ${color.class} ${
                        formData().color === color.value
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : 'hover:scale-110'
                      } transition-transform`}
                      title={color.label}
                    />
                  )}
                </For>
              </div>
            </div>

            <div class="flex gap-2">
              <Button type="submit" size="sm" disabled={saving()}>
                Replace Bag
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowCustomForm(false);
                  setFormData({ name: '', type: 'carry_on', color: 'blue' });
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Show>
      </div>

      <div class="mt-6 flex justify-end">
        <Button variant="secondary" onClick={props.onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
