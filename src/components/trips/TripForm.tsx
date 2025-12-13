import { createSignal } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { Trip } from '../../lib/types';

interface TripFormProps {
  trip: Trip | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TripForm(props: TripFormProps) {
  const [name, setName] = createSignal(props.trip?.name || '');
  const [destination, setDestination] = createSignal(props.trip?.destination || '');
  const [startDate, setStartDate] = createSignal(props.trip?.start_date || '');
  const [endDate, setEndDate] = createSignal(props.trip?.end_date || '');
  const [notes, setNotes] = createSignal(props.trip?.notes || '');
  const [saving, setSaving] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    if (!name().trim()) {
      showToast('error', 'Trip name is required');
      return;
    }

    setSaving(true);

    const data = {
      name: name().trim(),
      destination: destination().trim() || null,
      start_date: startDate() || null,
      end_date: endDate() || null,
      notes: notes().trim() || null,
    };

    const response = props.trip
      ? await api.put(endpoints.trip(props.trip.id), data)
      : await api.post(endpoints.trips, data);

    setSaving(false);

    if (response.success) {
      showToast('success', props.trip ? 'Trip updated' : 'Trip created');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to save trip');
    }
  };

  return (
    <Modal isOpen={true} onClose={props.onClose} title={props.trip ? 'Edit Trip' : 'New Trip'}>
      <form onSubmit={handleSubmit} class="space-y-4">
        <Input
          label="Trip Name *"
          type="text"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="e.g., Summer Vacation 2025"
          required
        />

        <Input
          label="Destination"
          type="text"
          value={destination()}
          onInput={(e) => setDestination(e.currentTarget.value)}
          placeholder="e.g., Paris, France"
        />

        <div class="grid grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={startDate()}
            onInput={(e) => setStartDate(e.currentTarget.value)}
          />
          <Input
            label="End Date"
            type="date"
            value={endDate()}
            onInput={(e) => setEndDate(e.currentTarget.value)}
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
            placeholder="Trip details, reminders, etc."
            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={3}
          />
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
