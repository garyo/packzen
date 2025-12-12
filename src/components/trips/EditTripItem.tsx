import { createSignal, createResource, For } from 'solid-js';
import { api, endpoints } from '../../lib/api';
import type { TripItem, Bag } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { showToast } from '../ui/Toast';

interface EditTripItemProps {
  tripId: string;
  item: TripItem;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTripItem(props: EditTripItemProps) {
  const [quantity, setQuantity] = createSignal(props.item.quantity);
  const [bagId, setBagId] = createSignal<string | null>(props.item.bag_id);

  const [bags] = createResource<Bag[]>(async () => {
    const response = await api.get<Bag[]>(endpoints.tripBags(props.tripId));
    if (response.success && response.data) {
      return response.data;
    }
    return [];
  });

  const handleSave = async () => {
    const response = await api.patch(endpoints.tripItems(props.tripId), {
      id: props.item.id,
      quantity: quantity(),
      bag_id: bagId(),
    });

    if (response.success) {
      showToast('success', 'Item updated');
      props.onSaved();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to update item');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;

    const response = await api.delete(endpoints.tripItems(props.tripId), {
      body: JSON.stringify({ id: props.item.id }),
    });

    if (response.success) {
      showToast('success', 'Item deleted');
      props.onSaved();
      props.onClose();
    } else {
      showToast('error', response.error || 'Failed to delete item');
    }
  };

  return (
    <Modal title={`Edit: ${props.item.name}`} onClose={props.onClose}>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <Input
            type="number"
            min="1"
            value={quantity()}
            onInput={(e) => setQuantity(parseInt(e.currentTarget.value) || 1)}
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Bag</label>
          <select
            value={bagId() || ''}
            onChange={(e) => setBagId(e.target.value || null)}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">No bag</option>
            <For each={bags()}>
              {(bag) => <option value={bag.id}>{bag.name}</option>}
            </For>
          </select>
        </div>

        <div class="flex gap-2 pt-4">
          <Button onClick={handleSave} class="flex-1">
            Save
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
