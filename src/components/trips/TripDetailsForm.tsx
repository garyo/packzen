import { createSignal } from 'solid-js';
import { Input } from '../ui/Input';
import { DateInput } from '../ui/DateInput';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';

export interface TripDetailsData {
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

interface TripDetailsFormProps {
  initialData?: Partial<TripDetailsData>;
  onSubmit: (data: TripDetailsData) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function TripDetailsForm(props: TripDetailsFormProps) {
  const [name, setName] = createSignal(props.initialData?.name || '');
  const [destination, setDestination] = createSignal(props.initialData?.destination || '');
  const [startDate, setStartDate] = createSignal(props.initialData?.start_date || '');
  const [endDate, setEndDate] = createSignal(props.initialData?.end_date || '');
  const [notes, setNotes] = createSignal(props.initialData?.notes || '');

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!name().trim()) {
      showToast('error', 'Trip name is required');
      return;
    }

    const data: TripDetailsData = {
      name: name().trim(),
      destination: destination().trim() || null,
      start_date: startDate() || null,
      end_date: endDate() || null,
      notes: notes().trim() || null,
    };

    props.onSubmit(data);
  };

  return (
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
        <DateInput label="Start Date" value={startDate()} onInput={setStartDate} />
        <DateInput label="End Date" value={endDate()} onInput={setEndDate} min={startDate()} />
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
        {props.onCancel && (
          <Button type="button" variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{props.submitLabel || 'Continue'}</Button>
      </div>
    </form>
  );
}
