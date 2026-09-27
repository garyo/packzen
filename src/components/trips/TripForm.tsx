import { createSignal } from 'solid-js';
import { Modal } from '../ui/Modal';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { Trip } from '../../lib/types';
import { TripDetailsForm, type TripDetailsData } from './TripDetailsForm';

interface TripFormProps {
  trip: Trip;
  onClose: () => void;
  onSaved: () => void;
}

/** Edit an existing trip's details. New trips are created by `TripFormWithBags`. */
export function TripForm(props: TripFormProps) {
  const [saving, setSaving] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);

  const handleSubmit = async (data: TripDetailsData) => {
    if (saving()) return;
    setSaving(true);
    const response = await api.patch(endpoints.trip(props.trip.id), data);
    setSaving(false);

    if (response.success) {
      showToast('success', 'Trip updated');
      props.onSaved();
    } else {
      showToast('error', response.error || 'Failed to save trip');
    }
  };

  return (
    <Modal onClose={props.onClose} title="Edit Trip" isDirty={dirty}>
      <TripDetailsForm
        initialData={props.trip}
        onSubmit={handleSubmit}
        onCancel={props.onClose}
        submitLabel={saving() ? 'Saving...' : 'Save'}
        submitting={saving()}
        onDirtyChange={setDirty}
      />
    </Modal>
  );
}
