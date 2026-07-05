import { createSignal, createResource, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { showToast } from '../ui/Toast';
import { api, endpoints } from '../../lib/api';
import type { BagTemplate, Trip } from '../../lib/types';
import { TripDetailsForm, type TripDetailsData } from './TripDetailsForm';
import { BagSelectionForm, type CustomBagData } from './BagSelectionForm';
import { fetchWithErrorHandling } from '../../lib/resource-helpers';

interface TripFormWithBagsProps {
  onClose: () => void;
  onSaved: (tripId: string) => void;
}

export function TripFormWithBags(props: TripFormWithBagsProps) {
  const [step, setStep] = createSignal<1 | 2>(1);
  const [tripData, setTripData] = createSignal<TripDetailsData | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = createSignal<Set<string>>(new Set());
  const [customBags, setCustomBags] = createSignal<CustomBagData[]>([]);
  const [creating, setCreating] = createSignal(false);

  // Fetch bag templates
  const [bagTemplates] = createResource<BagTemplate[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<BagTemplate[]>(endpoints.bagTemplates),
      'Failed to load bags'
    );
  });

  const handleStep1Submit = (data: TripDetailsData) => {
    setTripData(data);
    setStep(2);
  };

  const handleTemplateToggle = (id: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddCustomBag = (bag: CustomBagData) => {
    setCustomBags((prev) => [...prev, bag]);
  };

  const handleRemoveCustomBag = (index: number) => {
    setCustomBags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinalSubmit = async () => {
    const data = tripData();
    if (!data) return;

    setCreating(true);

    try {
      // Step 1: Create the trip
      const tripResponse = await api.post<Trip>(endpoints.trips, data);

      if (!tripResponse.success || !tripResponse.data) {
        showToast('error', tripResponse.error || 'Failed to create trip');
        setCreating(false);
        return;
      }

      const newTripId = tripResponse.data.id;

      // Step 2: Create bags from selected templates (independent inserts, run in parallel)
      const templates = bagTemplates() || [];
      const selectedTemplates = templates.filter((t) => selectedTemplateIds().has(t.id));

      const templateBagResponses = await Promise.all(
        selectedTemplates.map((template) =>
          api.post(endpoints.tripBags(newTripId), {
            name: template.name,
            type: template.type,
            color: template.color,
            sort_order: 0,
          })
        )
      );

      // Step 3: Create custom bags (and optionally save to My Bags), also in parallel
      const customBagResponses = await Promise.all(
        customBags().map(async (bag) => {
          // Save to bag templates if requested
          if (bag.saveToMyBags) {
            await api.post(endpoints.bagTemplates, {
              name: bag.name,
              type: bag.type,
              color: bag.color,
            });
          }

          // Always add to this trip
          return api.post(endpoints.tripBags(newTripId), {
            name: bag.name,
            type: bag.type,
            color: bag.color,
            sort_order: 0,
          });
        })
      );

      const failedBagCount = [...templateBagResponses, ...customBagResponses].filter(
        (response) => !response.success
      ).length;

      setCreating(false);
      if (failedBagCount > 0) {
        showToast(
          'error',
          `Trip created, but ${failedBagCount} bag${failedBagCount === 1 ? '' : 's'} failed to add. You can add ${failedBagCount === 1 ? 'it' : 'them'} from the trip.`
        );
      } else {
        showToast('success', 'Trip created successfully!');
      }
      props.onSaved(newTripId);
    } catch (error) {
      setCreating(false);
      showToast('error', 'Failed to create trip. Please try again.');
    }
  };

  const getModalTitle = () => {
    if (step() === 1) return 'New Trip';
    return 'Select Bags';
  };

  return (
    <Modal onClose={props.onClose} title={getModalTitle()}>
      <Show when={!creating()} fallback={<LoadingSpinner text="Creating your trip..." />}>
        <Show when={step() === 1}>
          <TripDetailsForm onSubmit={handleStep1Submit} onCancel={props.onClose} />
        </Show>

        <Show when={step() === 2}>
          <Show
            when={!bagTemplates.loading}
            fallback={<LoadingSpinner text="Loading My Bags..." />}
          >
            <BagSelectionForm
              templates={bagTemplates() || []}
              selectedTemplateIds={selectedTemplateIds()}
              customBags={customBags()}
              onTemplateToggle={handleTemplateToggle}
              onAddCustomBag={handleAddCustomBag}
              onRemoveCustomBag={handleRemoveCustomBag}
              onBack={() => setStep(1)}
              onSubmit={handleFinalSubmit}
            />
          </Show>
        </Show>
      </Show>
    </Modal>
  );
}
