import { createSignal, createMemo, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { MasterItem, Category } from '../../lib/types';

interface ItemFormProps {
  item: MasterItem | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function ItemForm(props: ItemFormProps) {
  const [name, setName] = createSignal(props.item?.name || '');
  const [description, setDescription] = createSignal(props.item?.description || '');
  const [categoryId, setCategoryId] = createSignal(props.item?.category_id || '');
  const [quantity, setQuantity] = createSignal(props.item?.default_quantity || 1);
  const [isContainer, setIsContainer] = createSignal(props.item?.is_container || false);
  const [saving, setSaving] = createSignal(false);

  // Sort categories alphabetically
  const sortedCategories = createMemo(() => {
    return [...props.categories].sort((a, b) => a.name.localeCompare(b.name));
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!name().trim()) {
      showToast('error', 'Name is required');
      return;
    }

    setSaving(true);

    const data = {
      name: name().trim(),
      description: description().trim() || null,
      category_id: categoryId() || null,
      default_quantity: quantity(),
      is_container: isContainer(),
    };

    const response = props.item
      ? await api.put(endpoints.masterItem(props.item.id), data)
      : await api.post(endpoints.masterItems, data);

    setSaving(false);

    if (response.success) {
      showToast('success', props.item ? 'Item updated' : 'Item created');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to save item');
    }
  };

  return (
    <Modal isOpen={true} onClose={props.onClose} title={props.item ? 'Edit Item' : 'Add Item'}>
      <form onSubmit={handleSubmit} class="space-y-4">
        <Input
          label="Item Name *"
          type="text"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="e.g., T-shirts"
          required
        />

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <select
            value={categoryId()}
            onChange={(e) => setCategoryId(e.currentTarget.value)}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">No category</option>
            {sortedCategories().map((cat) => (
              <option value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Optional notes about this item"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={3}
          />
        </div>

        <Input
          label="Default Quantity"
          type="number"
          min="1"
          value={quantity()}
          onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
        />

        {/* Container checkbox */}
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="is-container-master"
            checked={isContainer()}
            onChange={(e) => setIsContainer(e.currentTarget.checked)}
            class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label for="is-container-master" class="text-sm font-medium text-gray-700">
            This is a container (sub-bag like a toilet kit)
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving()}>
            {saving() ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
