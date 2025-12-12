import { createSignal, createResource, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag } from '../../lib/types';
import { BAG_TYPES } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';

interface BagManagerProps {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

const BAG_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
  { value: 'black', label: 'Black', class: 'bg-black' },
];

export function BagManager(props: BagManagerProps) {
  const [showForm, setShowForm] = createSignal(false);
  const [formData, setFormData] = createSignal({
    name: '',
    type: 'carry_on' as const,
    color: 'blue',
  });

  const [bags, { refetch }] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const data = formData();
    if (!data.name.trim()) {
      showToast('error', 'Bag name is required');
      return;
    }

    const response = await api.post(endpoints.tripBags(props.tripId), {
      name: data.name.trim(),
      type: data.type,
      color: data.color,
      sort_order: (bags()?.length || 0),
    });

    if (response.success) {
      showToast('success', 'Bag added');
      setFormData({ name: '', type: 'carry_on', color: 'blue' });
      setShowForm(false);
      refetch();
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to add bag');
    }
  };

  const handleDelete = async (bagId: string) => {
    if (!confirm('Delete this bag? Items in this bag will not be deleted.')) return;

    const response = await api.delete(endpoints.tripBags(props.tripId), {
      body: JSON.stringify({ bag_id: bagId }),
    });

    if (response.success) {
      showToast('success', 'Bag deleted');
      refetch();
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to delete bag');
    }
  };

  return (
    <Modal title="Manage Bags" onClose={props.onClose}>
      <div class="space-y-4">
        {/* Existing Bags */}
        <div>
          <h3 class="font-semibold text-gray-900 mb-3">Bags for this trip</h3>
          <Show when={!bags.loading} fallback={<LoadingSpinner text="Loading bags..." />}>
            <Show
              when={(bags()?.length || 0) > 0}
              fallback={
                <div class="text-center py-4 text-gray-500 text-sm">
                  No bags yet. Add your first bag below.
                </div>
              }
            >
              <div class="space-y-2">
                <For each={bags()}>
                  {(bag) => (
                    <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300">
                      <div class="flex items-center gap-3">
                        <div
                          class={`w-4 h-4 rounded-full ${
                            BAG_COLORS.find((c) => c.value === bag.color)?.class || 'bg-gray-500'
                          }`}
                        />
                        <div>
                          <p class="font-medium text-gray-900">{bag.name}</p>
                          <p class="text-xs text-gray-500">
                            {BAG_TYPES.find((t) => t.type === bag.type)?.label || bag.type}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(bag.id)}
                        class="text-red-600 hover:text-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        {/* Add New Bag */}
        <div class="border-t border-gray-200 pt-4">
          <Show
            when={showForm()}
            fallback={
              <Button onClick={() => setShowForm(true)} variant="secondary" size="sm">
                + Add Bag
              </Button>
            }
          >
            <form onSubmit={handleSubmit} class="space-y-3">
              <h3 class="font-semibold text-gray-900">Add New Bag</h3>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Bag Type</label>
                <select
                  value={formData().type}
                  onChange={(e) =>
                    setFormData({ ...formData(), type: e.target.value as any })
                  }
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <label class="block text-sm font-medium text-gray-700 mb-1">Bag Name</label>
                <Input
                  type="text"
                  value={formData().name}
                  onInput={(e) =>
                    setFormData({ ...formData(), name: e.currentTarget.value })
                  }
                  placeholder="e.g., Red Suitcase"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <div class="flex gap-2">
                  <For each={BAG_COLORS}>
                    {(color) => (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData(), color: color.value })}
                        class={`w-8 h-8 rounded-full ${color.class} ${
                          formData().color === color.value
                            ? 'ring-2 ring-offset-2 ring-blue-500'
                            : 'hover:scale-110'
                        } transition-transform`}
                        title={color.label}
                      />
                    )}
                  </For>
                </div>
              </div>

              <div class="flex gap-2">
                <Button type="submit" size="sm">
                  Add Bag
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({ name: '', type: 'carry_on', color: 'blue' });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Show>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <Button variant="secondary" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
