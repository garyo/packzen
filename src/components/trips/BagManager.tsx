import { createSignal, createResource, For, Show } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { Bag, BagTemplate, BagType } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { EditIcon, TrashIcon } from '../ui/Icons';
import { BagChip, BagFields, DEFAULT_BAG_FIELDS, type BagFieldValues } from './BagFields';

interface BagManagerProps {
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function BagManager(props: BagManagerProps) {
  const [showForm, setShowForm] = createSignal(false);
  const [formData, setFormData] = createSignal<BagFieldValues>(DEFAULT_BAG_FIELDS);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editData, setEditData] = createSignal<BagFieldValues>(DEFAULT_BAG_FIELDS);
  // Serializes writes so a double tap can't add the same bag twice.
  const [busy, setBusy] = createSignal(false);

  const [bags, { refetch }] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    return response.success && response.data ? response.data : [];
  });

  const [bagTemplates] = createResource<BagTemplate[]>(async () => {
    const response = await api.get<BagTemplate[]>(endpoints.bagTemplates);
    return response.success && response.data ? response.data : [];
  });

  const runExclusive = async (action: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    await action();
    setBusy(false);
  };

  const refreshAfterChange = () => {
    refetch();
    props.onSaved();
  };

  const addBag = async (bag: BagFieldValues, successMessage: string): Promise<boolean> => {
    const response = await api.post(endpoints.tripBags(props.tripId), {
      name: bag.name.trim(),
      type: bag.type,
      color: bag.color,
      sort_order: bags()?.length || 0,
    });
    if (!response.success) {
      showToast('error', response.error || 'Failed to add bag');
      return false;
    }
    showToast('success', successMessage);
    refreshAfterChange();
    return true;
  };

  const handleAddFromTemplate = (template: BagTemplate) =>
    runExclusive(async () => {
      await addBag(
        { name: template.name, type: template.type as BagType, color: template.color || 'blue' },
        `Added ${template.name}`
      );
    });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!formData().name.trim()) {
      showToast('error', 'Bag name is required');
      return;
    }
    void runExclusive(async () => {
      if (await addBag(formData(), 'Bag added')) {
        setFormData(DEFAULT_BAG_FIELDS);
        setShowForm(false);
      }
    });
  };

  const handleDelete = async (bag: Bag) => {
    const confirmed = await confirmDialog({
      title: `Delete "${bag.name}"?`,
      message: 'Items in this bag will not be deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    await runExclusive(async () => {
      const response = await api.delete(endpoints.tripBags(props.tripId), {
        body: JSON.stringify({ bag_id: bag.id }),
      });
      if (response.success) {
        showToast('success', 'Bag deleted');
        refreshAfterChange();
      } else {
        showToast('error', response.error || 'Failed to delete bag');
      }
    });
  };

  const startEdit = (bag: Bag) => {
    setEditingId(bag.id);
    setEditData({ name: bag.name, type: bag.type as BagType, color: bag.color || 'blue' });
  };

  const handleUpdate = (e: Event) => {
    e.preventDefault();
    const data = editData();
    if (!data.name.trim()) {
      showToast('error', 'Bag name is required');
      return;
    }
    void runExclusive(async () => {
      const response = await api.patch(endpoints.tripBags(props.tripId), {
        bag_id: editingId(),
        name: data.name.trim(),
        type: data.type,
        color: data.color,
      });
      if (response.success) {
        showToast('success', 'Bag updated');
        setEditingId(null);
        refreshAfterChange();
      } else {
        showToast('error', response.error || 'Failed to update bag');
      }
    });
  };

  return (
    <Modal
      title="Manage Bags"
      onClose={props.onClose}
      isDirty={() => editingId() !== null || (showForm() && !!formData().name.trim())}
    >
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
                    <Show
                      when={editingId() === bag.id}
                      fallback={
                        <div class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-300">
                          <BagChip bag={bag} />
                          <button
                            onClick={() => startEdit(bag)}
                            class="p-1 text-gray-400 hover:text-blue-600"
                            title="Edit bag"
                            aria-label={`Edit ${bag.name}`}
                          >
                            <EditIcon class="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(bag)}
                            disabled={busy()}
                            class="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="Delete bag"
                            aria-label={`Delete ${bag.name}`}
                          >
                            <TrashIcon class="h-4 w-4" />
                          </button>
                        </div>
                      }
                    >
                      <form
                        onSubmit={handleUpdate}
                        class="space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
                      >
                        <BagFields value={editData()} onChange={setEditData} />
                        <div class="flex gap-2">
                          <Button type="submit" size="sm" disabled={busy()}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </Show>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        {/* Add from Templates */}
        <Show when={(bagTemplates()?.length || 0) > 0}>
          <div class="border-t border-gray-200 pt-4">
            <h3 class="mb-3 font-semibold text-gray-900">Quick Add from My Bags</h3>
            <div class="grid grid-cols-2 gap-2">
              <For each={bagTemplates()}>
                {(template) => (
                  <button
                    onClick={() => handleAddFromTemplate(template)}
                    disabled={busy()}
                    class="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <BagChip bag={template} />
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Add New Bag */}
        <div class="border-t border-gray-200 pt-4">
          <Show
            when={showForm()}
            fallback={
              <Button onClick={() => setShowForm(true)} variant="secondary" size="sm">
                + Add Custom Bag
              </Button>
            }
          >
            <form onSubmit={handleSubmit} class="space-y-3">
              <h3 class="font-semibold text-gray-900">Add New Bag</h3>
              <BagFields value={formData()} onChange={setFormData} />
              <div class="flex gap-2">
                <Button type="submit" size="sm" disabled={busy()}>
                  Add Bag
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setFormData(DEFAULT_BAG_FIELDS);
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
