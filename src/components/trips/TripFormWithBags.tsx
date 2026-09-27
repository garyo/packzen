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

interface CreateError {
  message: string;
  /** The plan's trip limit was reached (HTTP 403). */
  isLimit: boolean;
}

export function TripFormWithBags(props: TripFormWithBagsProps) {
  const [step, setStep] = createSignal<1 | 2>(1);
  const [tripData, setTripData] = createSignal<TripDetailsData | null>(null);
  const [detailsDirty, setDetailsDirty] = createSignal(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = createSignal<Set<string>>(new Set());
  const [customBags, setCustomBags] = createSignal<CustomBagData[]>([]);
  const [creating, setCreating] = createSignal(false);
  const [createError, setCreateError] = createSignal<CreateError | null>(null);

  const [bagTemplates] = createResource<BagTemplate[]>(async () => {
    return fetchWithErrorHandling(
      () => api.get<BagTemplate[]>(endpoints.bagTemplates),
      'Failed to load bags'
    );
  });

  const isDirty = () => tripData() !== null || detailsDirty();

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

  // Save "Save to My Bags" bags as templates, skipping names My Bags already
  // has (case-insensitive) so re-using a preset or name never duplicates one.
  // One at a time, so the server's template limit counts each save.
  const saveNewTemplates = async (templates: BagTemplate[]) => {
    const savedNames = new Set(templates.map((t) => t.name.toLowerCase()));
    for (const bag of customBags()) {
      const key = bag.name.toLowerCase();
      if (!bag.saveToMyBags || savedNames.has(key)) continue;
      savedNames.add(key);
      await api.post(endpoints.bagTemplates, { name: bag.name, type: bag.type, color: bag.color });
    }
  };

  const handleFinalSubmit = async () => {
    const data = tripData();
    if (!data || creating()) return;

    setCreating(true);
    setCreateError(null);

    const tripResponse = await api.post<Trip>(endpoints.trips, data);
    if (!tripResponse.success || !tripResponse.data) {
      setCreateError({
        message: tripResponse.error || 'Failed to create trip. Please try again.',
        isLimit: tripResponse.statusCode === 403,
      });
      setCreating(false);
      return;
    }

    const newTripId = tripResponse.data.id;
    const templates = bagTemplates() || [];
    const bagsToAdd = [
      ...templates.filter((t) => selectedTemplateIds().has(t.id)),
      ...customBags(),
    ];

    const [bagResponses] = await Promise.all([
      Promise.all(
        bagsToAdd.map((bag, index) =>
          api.post(endpoints.tripBags(newTripId), {
            name: bag.name,
            type: bag.type,
            color: bag.color,
            sort_order: index,
          })
        )
      ),
      saveNewTemplates(templates),
    ]);

    const failedBagCount = bagResponses.filter((response) => !response.success).length;
    if (failedBagCount > 0) {
      showToast(
        'error',
        `Trip created, but ${failedBagCount} bag${failedBagCount === 1 ? '' : 's'} failed to add. You can add ${failedBagCount === 1 ? 'it' : 'them'} from the trip.`
      );
    } else {
      showToast('success', 'Trip created!');
    }
    props.onSaved(newTripId);
  };

  return (
    <Modal
      onClose={props.onClose}
      title={step() === 1 ? 'New Trip' : 'Select Bags'}
      isDirty={isDirty}
    >
      <Show when={!creating()} fallback={<LoadingSpinner text="Creating your trip..." />}>
        <Show when={createError()}>
          {(error) => (
            <div
              role="alert"
              class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p>{error().message}</p>
              <Show when={error().isLimit}>
                <a
                  href="/pricing"
                  class="mt-1 inline-block font-medium text-blue-700 underline hover:text-blue-900"
                >
                  See plans →
                </a>
              </Show>
            </div>
          )}
        </Show>

        <Show when={step() === 1}>
          <TripDetailsForm
            initialData={tripData() ?? undefined}
            onSubmit={handleStep1Submit}
            onCancel={props.onClose}
            onDirtyChange={setDetailsDirty}
          />
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
              onAddCustomBag={(bag) => setCustomBags((prev) => [...prev, bag])}
              onRemoveCustomBag={(index) =>
                setCustomBags((prev) => prev.filter((_, i) => i !== index))
              }
              onBack={() => setStep(1)}
              onSubmit={handleFinalSubmit}
            />
          </Show>
        </Show>
      </Show>
    </Modal>
  );
}
