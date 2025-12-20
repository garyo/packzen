import { createSignal, For, Show } from 'solid-js';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { Category } from '../../lib/types';

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

    if (!newName().trim()) {
      showToast('error', 'Category name is required');
      return;
    }

    setAdding(true);

    const response = await api.post(endpoints.categories, {
      name: newName().trim(),
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Items will become uncategorized.')) return;

    const response = await api.delete(endpoints.category(id));

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
            class="w-10 rounded-lg border border-gray-300 px-2 py-2 text-center focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            placeholder="Category name"
            class="w-64 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Button type="submit" disabled={adding()}>
            {adding() ? '...' : 'Add'}
          </Button>
        </div>
      </form>

      {/* Existing Categories */}
      <div>
        <h3 class="mb-3 text-sm font-medium text-gray-700">Your Categories</h3>
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
                        class="p-1 text-gray-400 hover:text-blue-600"
                        title="Edit category"
                      >
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        class="p-1 text-gray-400 hover:text-red-600"
                        title="Delete category"
                      >
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                }
              >
                <form onSubmit={handleUpdate} class="col-span-full rounded-lg bg-blue-50 p-3">
                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={editIcon()}
                      onInput={(e) => setEditIcon(e.currentTarget.value)}
                      placeholder="📦"
                      class="w-10 rounded-lg border border-gray-300 px-2 py-2 text-center focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editName()}
                      onInput={(e) => setEditName(e.currentTarget.value)}
                      placeholder="Category name"
                      class="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
