import { createSignal, For, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { BagTemplate } from '../../lib/types';
import { BAG_TYPES } from '../../lib/types';

interface BagTemplateManagerProps {
  templates: BagTemplate[];
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

export function BagTemplateManager(props: BagTemplateManagerProps) {
  const [newName, setNewName] = createSignal('');
  const [newType, setNewType] = createSignal<'carry_on' | 'checked' | 'personal' | 'custom'>('carry_on');
  const [newColor, setNewColor] = createSignal('blue');
  const [adding, setAdding] = createSignal(false);

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');
  const [editType, setEditType] = createSignal<'carry_on' | 'checked' | 'personal' | 'custom'>('carry_on');
  const [editColor, setEditColor] = createSignal('blue');
  const [updating, setUpdating] = createSignal(false);

  const handleAdd = async (e: Event) => {
    e.preventDefault();

    if (!newName().trim()) {
      showToast('error', 'Bag name is required');
      return;
    }

    setAdding(true);

    const response = await api.post(endpoints.bagTemplates, {
      name: newName().trim(),
      type: newType(),
      color: newColor(),
      sort_order: props.templates.length,
    });

    setAdding(false);

    if (response.success) {
      showToast('success', 'Bag added');
      setNewName('');
      setNewType('carry_on');
      setNewColor('blue');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to add bag');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bag?')) return;

    const response = await api.delete(endpoints.bagTemplate(id));

    if (response.success) {
      showToast('success', 'Bag deleted');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to delete bag');
    }
  };

  const startEdit = (template: BagTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditType(template.type as any);
    setEditColor(template.color || 'blue');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditType('carry_on');
    setEditColor('blue');
  };

  const handleUpdate = async (e: Event) => {
    e.preventDefault();

    if (!editName().trim()) {
      showToast('error', 'Bag name is required');
      return;
    }

    setUpdating(true);

    const response = await api.patch(endpoints.bagTemplate(editingId()!), {
      name: editName().trim(),
      type: editType(),
      color: editColor(),
    });

    setUpdating(false);

    if (response.success) {
      showToast('success', 'Bag updated');
      cancelEdit();
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to update bag');
    }
  };

  return (
    <Modal title="My Bags" onClose={props.onClose}>
      <div class="space-y-6">
        {/* Add New Template Form */}
        <div>
          <h3 class="mb-3 font-semibold text-gray-900">Add New Bag</h3>
          <form onSubmit={handleAdd} class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag Type</label>
              <select
                value={newType()}
                onChange={(e) => setNewType(e.target.value as any)}
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <For each={BAG_TYPES}>
                  {(type) => <option value={type.type}>{type.label}</option>}
                </For>
              </select>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag Name</label>
              <Input
                type="text"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                placeholder="e.g., Weekend Carry-on, Red Suitcase"
              />
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Color</label>
              <div class="flex gap-2">
                <For each={BAG_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      onClick={() => setNewColor(color.value)}
                      class={`h-6 w-6 rounded-full ${color.class} ${
                        newColor() === color.value
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : 'hover:scale-110'
                      } transition-transform`}
                      title={color.label}
                    />
                  )}
                </For>
              </div>
            </div>

            <Button type="submit" size="sm" disabled={adding()}>
              {adding() ? 'Adding...' : 'Add Bag'}
            </Button>
          </form>
        </div>

        {/* Existing Templates */}
        <div>
          <h3 class="mb-3 font-semibold text-gray-900">Your Bags</h3>
          <Show
            when={props.templates.length > 0}
            fallback={
              <div class="py-4 text-center text-sm text-gray-500">
                No bags yet. Add your first bag above.
              </div>
            }
          >
            <div class="space-y-2">
              <For each={props.templates}>
                {(template) => (
                  <>
                    {editingId() === template.id ? (
                      <form
                        onSubmit={handleUpdate}
                        class="space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3"
                      >
                        <div>
                          <label class="mb-1 block text-sm font-medium text-gray-700">
                            Bag Type
                          </label>
                          <select
                            value={editType()}
                            onChange={(e) => setEditType(e.target.value as any)}
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
                            value={editName()}
                            onInput={(e) => setEditName(e.currentTarget.value)}
                            placeholder="e.g., Weekend Carry-on"
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
                                  onClick={() => setEditColor(color.value)}
                                  class={`h-6 w-6 rounded-full ${color.class} ${
                                    editColor() === color.value
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
                          <Button type="submit" size="sm" disabled={updating()}>
                            {updating() ? 'Saving...' : 'Save'}
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
                              BAG_COLORS.find((c) => c.value === template.color)?.class ||
                              'bg-gray-500'
                            }`}
                          />
                          <div>
                            <p class="font-medium text-gray-900">{template.name}</p>
                            <p class="text-xs text-gray-500">
                              {BAG_TYPES.find((t) => t.type === template.type)?.label ||
                                template.type}
                            </p>
                          </div>
                        </div>
                        <div class="flex gap-2">
                          <button
                            onClick={() => startEdit(template)}
                            class="text-sm text-blue-600 hover:text-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(template.id)}
                            class="text-sm text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Modal>
  );
}
