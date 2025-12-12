import { createSignal, For } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { Category } from '../../lib/types';

interface CategoryManagerProps {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryManager(props: CategoryManagerProps) {
  const [newName, setNewName] = createSignal('');
  const [newIcon, setNewIcon] = createSignal('');
  const [adding, setAdding] = createSignal(false);

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

  return (
    <Modal isOpen={true} onClose={props.onClose} title="Manage Categories">
      <div class="space-y-4">
        {/* Add New Category */}
        <form onSubmit={handleAdd} class="border-b border-gray-200 pb-4">
          <h3 class="text-sm font-medium text-gray-700 mb-3">Add New Category</h3>
          <div class="flex gap-2">
            <Input
              type="text"
              value={newIcon()}
              onInput={(e) => setNewIcon(e.currentTarget.value)}
              placeholder="📦"
              class="w-16"
            />
            <Input
              type="text"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              placeholder="Category name"
              class="flex-1"
            />
            <Button type="submit" disabled={adding()}>
              {adding() ? '...' : 'Add'}
            </Button>
          </div>
        </form>

        {/* Existing Categories */}
        <div>
          <h3 class="text-sm font-medium text-gray-700 mb-3">Your Categories</h3>
          <div class="space-y-2">
            <For
              each={props.categories}
              fallback={
                <p class="text-sm text-gray-500 text-center py-4">No categories yet</p>
              }
            >
              {(category) => (
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-2">
                    <span class="text-xl">{category.icon || '📦'}</span>
                    <span class="font-medium text-gray-900">{category.name}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(category.id)}
                    class="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="flex justify-end pt-4">
          <Button variant="secondary" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
