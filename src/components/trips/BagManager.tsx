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
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editData, setEditData] = createSignal({
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
      sort_order: bags()?.length || 0,
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

  const startEdit = (bag: Bag) => {
    setEditingId(bag.id);
    setEditData({
      name: bag.name,
      type: bag.type as any,
      color: bag.color || 'blue',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ name: '', type: 'carry_on', color: 'blue' });
  };

  const handleUpdate = async (e: Event) => {
    e.preventDefault();

    const data = editData();
    if (!data.name.trim()) {
      showToast('error', 'Bag name is required');
      return;
    }

    const response = await api.patch(endpoints.tripBags(props.tripId), {
      bag_id: editingId(),
      name: data.name.trim(),
      type: data.type,
      color: data.color,
    });

    if (response.success) {
      showToast('success', 'Bag updated');
      cancelEdit();
      refetch();
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to update bag');
    }
  };

  return (
    <Modal title="Manage Bags" onClose={props.onClose}>
      <div class="space-y-4">
        {/* Existing Bags */}
        <div>
          <h3 class="mb-3 font-semibold text-gray-900">Bags for this trip</h3>
          <Show when={!bags.loading} fallback={<LoadingSpinner text="Loading bags..." />}>
            <Show
              when={(bags()?.length || 0) > 0}
              fallback={
                <div class="py-4 text-center text-sm text-gray-500">
                  No bags yet. Add your first bag below.
                </div>
              }
            >
              <div class="space-y-2">
                <For each={bags()}>
                  {(bag) => (
                    <>
                      {editingId() === bag.id ? (
                        <form
                          onSubmit={handleUpdate}
                          class="space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
                        >
                          <div>
                            <label class="mb-1 block text-sm font-medium text-gray-700">
                              Bag Type
                            </label>
                            <select
                              value={editData().type}
                              onChange={(e) =>
                                setEditData({ ...editData(), type: e.target.value as any })
                              }
                              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            >
                              <For each={BAG_TYPES}>
                                {(type) => <option value={type.type}>{type.label}</option>}
                              </For>
                            </select>
                          </div>

                          <div>
                            <label class="mb-1 block text-sm font-medium text-gray-700">
                              Bag Name
                            </label>
                            <Input
                              type="text"
                              value={editData().name}
                              onInput={(e) =>
                                setEditData({ ...editData(), name: e.currentTarget.value })
                              }
                              placeholder="e.g., Red Suitcase"
                            />
                          </div>

                          <div>
                            <label class="mb-1 block text-sm font-medium text-gray-700">
                              Color
                            </label>
                            <div class="flex gap-2">
                              <For each={BAG_COLORS}>
                                {(color) => (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditData({ ...editData(), color: color.value })
                                    }
                                    class={`h-6 w-6 rounded-full ${color.class} ${
                                      editData().color === color.value
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
                            <Button type="submit" size="sm">
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div class="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:border-gray-300">
                          <div class="flex items-center gap-3">
                            <div
                              class={`h-4 w-4 rounded-full ${
                                BAG_COLORS.find((c) => c.value === bag.color)?.class ||
                                'bg-gray-500'
                              }`}
                            />
                            <div>
                              <p class="font-medium text-gray-900">{bag.name}</p>
                              <p class="text-xs text-gray-500">
                                {BAG_TYPES.find((t) => t.type === bag.type)?.label || bag.type}
                              </p>
                            </div>
                          </div>
                          <div class="flex gap-2">
                            <button
                              onClick={() => startEdit(bag)}
                              class="p-1 text-gray-400 hover:text-blue-600"
                              title="Edit bag"
                            >
                              <svg
                                class="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(bag.id)}
                              class="p-1 text-gray-400 hover:text-red-600"
                              title="Delete bag"
                            >
                              <svg
                                class="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
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
                        class={`h-8 w-8 rounded-full ${color.class} ${
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
