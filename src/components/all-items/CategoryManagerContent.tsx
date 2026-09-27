import { createSignal, For, Show } from 'solid-js';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { api, endpoints } from '../../lib/api';
import type { Category } from '../../lib/types';
import { EditIcon, TrashIcon } from '../ui/Icons';

interface CategoryManagerContentProps {
  categories: Category[];
  onSaved: () => void;
}

export function CategoryManagerContent(props: CategoryManagerContentProps) {
  const [newName, setNewName] = createSignal('');
  const [newIcon, setNewIcon] = createSignal('');
  const [adding, setAdding] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');
  const [editIcon, setEditIcon] = createSignal('');
  const [updating, setUpdating] = createSignal(false);

  const handleAdd = async (e: Event) => {
    e.preventDefault();

    const name = newName().trim();
    if (!name) {
      showToast('error', 'Category name is required');
      return;
    }
    // The server would just return the existing one (get-or-create).
    const existing = props.categories.find(
      (c) => c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      showToast('info', `“${existing.name}” already exists`);
      return;
    }

    setAdding(true);

    const response = await api.post(endpoints.categories, {
      name,
      icon: newIcon().trim() || null,
      sort_order: props.categories.length,
    });

    setAdding(false);

    if (response.success) {
      showToast('success', 'Category added');
      setNewName('');
      setNewIcon('');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to add category');
    }
  };

  const handleDelete = async (category: Category) => {
    const confirmed = await confirmDialog({
      title: `Delete “${category.name}”?`,
      message: 'Its items become uncategorized.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    const response = await api.delete(endpoints.category(category.id));

    if (response.success) {
      showToast('success', 'Category deleted');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to delete category');
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditIcon('');
  };

  const handleUpdate = async (e: Event) => {
    e.preventDefault();

    if (!editName().trim()) {
      showToast('error', 'Category name is required');
      return;
    }

    setUpdating(true);

    const response = await api.patch(endpoints.category(editingId()!), {
      name: editName().trim(),
      icon: editIcon().trim() || null,
    });

    setUpdating(false);

    if (response.success) {
      showToast('success', 'Category updated');
      cancelEdit();
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to update category');
    }
  };

  // Sort categories alphabetically by name
  const sortedCategories = () => {
    return [...props.categories].sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div class="space-y-4">
      {/* Add New Category */}
      <form onSubmit={handleAdd} class="border-b border-gray-200 pb-4">
        <h3 class="mb-3 text-sm font-medium text-gray-700">Add New Category</h3>
        <div class="flex gap-2">
          <input
            type="text"
            value={newIcon()}
            onInput={(e) => setNewIcon(e.currentTarget.value)}
            placeholder="📦"
            aria-label="Category icon (emoji)"
            class="w-10 rounded-lg border border-gray-300 px-2 py-2 text-center focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            placeholder="Category name"
            aria-label="Category name"
            class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none md:w-64 md:flex-none"
          />
          <Button type="submit" disabled={adding()}>
            {adding() ? '...' : 'Add'}
          </Button>
        </div>
      </form>

      {/* Existing Categories */}
      <div>
        <h3 class="mb-3 text-sm font-medium text-gray-700">My Categories</h3>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          <For
            each={sortedCategories()}
            fallback={
              <p class="col-span-full py-4 text-center text-sm text-gray-500">No categories yet</p>
            }
          >
            {(category) => (
              <Show
                when={editingId() === category.id}
                fallback={
                  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div class="flex items-center gap-2">
                      <span class="text-xl">{category.icon || '📦'}</span>
                      <span class="font-medium text-gray-900">{category.name}</span>
                    </div>
                    <div class="flex gap-2">
                      <button
                        onClick={() => startEdit(category)}
                        class="flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-200 hover:text-blue-700"
                        aria-label={`Edit ${category.name}`}
                        title="Edit"
                      >
                        <EditIcon class="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category)}
                        class="flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-200 hover:text-red-700"
                        aria-label={`Delete ${category.name}`}
                        title="Delete"
                      >
                        <TrashIcon class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                }
              >
                <form onSubmit={handleUpdate} class="col-span-full rounded-lg bg-blue-50 p-3">
                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={editIcon()}
                      onInput={(e) => setEditIcon(e.currentTarget.value)}
                      placeholder="📦"
                      aria-label="Category icon (emoji)"
                      class="w-10 rounded-lg border border-gray-300 px-2 py-2 text-center focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editName()}
                      onInput={(e) => setEditName(e.currentTarget.value)}
                      placeholder="Category name"
                      aria-label="Category name"
                      class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Button type="submit" disabled={updating()} size="sm">
                      {updating() ? '...' : 'Save'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={cancelEdit} size="sm">
                      Cancel
                    </Button>
                  </div>
                </form>
              </Show>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
