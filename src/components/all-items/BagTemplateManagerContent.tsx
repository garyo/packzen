import { createSignal, For, Show } from 'solid-js';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { EditIcon, TrashIcon } from '../ui/Icons';
import { api, endpoints } from '../../lib/api';
import type { BagTemplate } from '../../lib/types';
import { BagChip, BagFields, DEFAULT_BAG_FIELDS, type BagFieldValues } from '../ui/BagFields';

interface BagTemplateManagerContentProps {
  templates: BagTemplate[];
  onSaved: () => void;
}

export function BagTemplateManagerContent(props: BagTemplateManagerContentProps) {
  const [newBag, setNewBag] = createSignal<BagFieldValues>(DEFAULT_BAG_FIELDS);
  const [adding, setAdding] = createSignal(false);

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editBag, setEditBag] = createSignal<BagFieldValues>(DEFAULT_BAG_FIELDS);
  const [updating, setUpdating] = createSignal(false);

  const handleAdd = async (e: Event) => {
    e.preventDefault();
    const { type, color } = newBag();
    const name = newBag().name.trim();
    if (!name) {
      showToast('error', 'Bag name is required');
      return;
    }

    setAdding(true);
    const response = await api.post(endpoints.bagTemplates, {
      name,
      type,
      color,
      sort_order: props.templates.length,
    });
    setAdding(false);

    if (response.success) {
      showToast('success', 'Bag added');
      setNewBag(DEFAULT_BAG_FIELDS);
    } else {
      showToast('error', response.error || 'Failed to add bag');
    }
    // Refetch either way: a "failed" write may still have committed
    // server-side (e.g. a D1 stall that errors after the insert). On failure
    // the form keeps its values for a retry.
    props.onSaved();
  };

  const handleDelete = async (template: BagTemplate) => {
    const confirmed = await confirmDialog({
      title: `Delete “${template.name}”?`,
      message: 'Trips that already use this bag keep it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    const response = await api.delete(endpoints.bagTemplate(template.id));
    if (response.success) {
      showToast('success', 'Bag deleted');
    } else {
      showToast('error', response.error || 'Failed to delete bag');
    }
    props.onSaved(); // the delete may have committed despite an error
  };

  const startEdit = (template: BagTemplate) => {
    setEditingId(template.id);
    setEditBag({
      name: template.name,
      type: template.type as BagFieldValues['type'],
      color: template.color || DEFAULT_BAG_FIELDS.color,
    });
  };

  const handleUpdate = async (e: Event) => {
    e.preventDefault();
    const { type, color } = editBag();
    const name = editBag().name.trim();
    if (!name) {
      showToast('error', 'Bag name is required');
      return;
    }

    setUpdating(true);
    const response = await api.patch(endpoints.bagTemplate(editingId()!), {
      name,
      type,
      color,
    });
    setUpdating(false);

    if (response.success) {
      showToast('success', 'Bag updated');
      setEditingId(null);
    } else {
      showToast('error', response.error || 'Failed to update bag');
    }
    // As with add: refetch to show the truth; a failed edit stays open.
    props.onSaved();
  };

  const iconButton = 'flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-200';

  return (
    <div class="space-y-6">
      <div>
        <h3 class="mb-3 font-semibold text-gray-900">Add New Bag</h3>
        <form
          onSubmit={handleAdd}
          class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
        >
          <BagFields
            value={newBag()}
            onChange={setNewBag}
            placeholder="e.g., Weekend Carry-on, Red Suitcase"
          />
          <Button type="submit" size="sm" disabled={adding()}>
            {adding() ? 'Adding...' : 'Add Bag'}
          </Button>
        </form>
      </div>

      <div>
        <h3 class="mb-3 font-semibold text-gray-900">My Bags</h3>
        <Show
          when={props.templates.length > 0}
          fallback={
            <div class="py-4 text-center text-sm text-gray-500">
              No bags yet. Add your first bag above.
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            <For each={props.templates}>
              {(template) => (
                <Show
                  when={editingId() === template.id}
                  fallback={
                    <div class="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:border-gray-300">
                      <div class="flex min-w-0 flex-1 items-center gap-3">
                        <BagChip bag={template} />
                      </div>
                      <div class="flex">
                        <button
                          type="button"
                          onClick={() => startEdit(template)}
                          class={`${iconButton} hover:text-blue-700`}
                          aria-label={`Edit ${template.name}`}
                          title="Edit"
                        >
                          <EditIcon class="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(template)}
                          class={`${iconButton} hover:text-red-700`}
                          aria-label={`Delete ${template.name}`}
                          title="Delete"
                        >
                          <TrashIcon class="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  }
                >
                  <form
                    onSubmit={handleUpdate}
                    class="col-span-full space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
                  >
                    <BagFields
                      value={editBag()}
                      onChange={setEditBag}
                      placeholder="e.g., Weekend Carry-on"
                    />
                    <div class="flex gap-2">
                      <Button type="submit" size="sm" disabled={updating()}>
                        {updating() ? 'Saving...' : 'Save'}
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
      </div>
    </div>
  );
}
