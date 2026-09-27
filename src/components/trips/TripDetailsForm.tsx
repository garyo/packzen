import { createEffect, createSignal } from 'solid-js';
import { Input } from '../ui/Input';
import { DateInput } from '../ui/DateInput';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { normalizeTripDates } from '../../lib/utils';

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
  submitting?: boolean;
  /** Reports whether any field differs from `initialData`. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function TripDetailsForm(props: TripDetailsFormProps) {
  const initial = {
    name: props.initialData?.name || '',
    destination: props.initialData?.destination || '',
    startDate: props.initialData?.start_date || '',
    endDate: props.initialData?.end_date || '',
    notes: props.initialData?.notes || '',
  };
  const [name, setName] = createSignal(initial.name);
  const [destination, setDestination] = createSignal(initial.destination);
  const [startDate, setStartDate] = createSignal(initial.startDate);
  const [endDate, setEndDate] = createSignal(initial.endDate);
  const [notes, setNotes] = createSignal(initial.notes);

  createEffect(() => {
    props.onDirtyChange?.(
      name() !== initial.name ||
        destination() !== initial.destination ||
        startDate() !== initial.startDate ||
        endDate() !== initial.endDate ||
        notes() !== initial.notes
    );
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!name().trim()) {
      showToast('error', 'Trip name is required');
      return;
    }

    const normalizedDates = normalizeTripDates(startDate() || null, endDate() || null);

    props.onSubmit({
      name: name().trim(),
      destination: destination().trim() || null,
      start_date: normalizedDates.startDate,
      end_date: normalizedDates.endDate,
      notes: notes().trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <Input
        label="Trip Name *"
        type="text"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
        placeholder="e.g., Beach Weekend"
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
        <Button type="submit" disabled={props.submitting}>
          {props.submitLabel || 'Continue'}
        </Button>
      </div>
    </form>
  );
}
