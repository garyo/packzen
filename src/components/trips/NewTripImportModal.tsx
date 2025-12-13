import { createSignal, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { yamlToTrip } from '../../lib/yaml';
import { api, endpoints } from '../../lib/api';

interface NewTripImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function NewTripImportModal(props: NewTripImportModalProps) {
  const [importing, setImporting] = createSignal(false);
  const [fileContent, setFileContent] = createSignal('');

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileContent()) {
      showToast('error', 'Please select a file');
      return;
    }

    setImporting(true);

    try {
      const tripData = yamlToTrip(fileContent());

      // Create new trip
      const tripResponse = await api.post(endpoints.trips, {
        name: tripData.trip.name,
        destination: tripData.trip.destination,
        start_date: tripData.trip.start_date,
        end_date: tripData.trip.end_date,
        notes: tripData.trip.notes,
      });

      if (!tripResponse.success || !tripResponse.data) {
        showToast('error', 'Failed to create trip');
        return;
      }

      const newTripId = tripResponse.data.id;

      // Create bags and map names to IDs
      const bagNameToId = new Map<string, string>();
      for (const bagData of tripData.bags) {
        const createResponse = await api.post(endpoints.tripBags(newTripId), {
          name: bagData.name,
          type: bagData.type,
          color: bagData.color,
          sort_order: bagData.sort_order,
        });
        if (createResponse.data) {
          bagNameToId.set(bagData.name, createResponse.data.id);
        }
      }

      // Create items
      for (const itemData of tripData.items) {
        const bagId = itemData.bag_name ? bagNameToId.get(itemData.bag_name) || null : null;
        await api.post(endpoints.tripItems(newTripId), {
          name: itemData.name,
          category_name: itemData.category_name,
          quantity: itemData.quantity,
          bag_id: bagId,
          master_item_id: null,
        });
      }

      showToast('success', `Trip "${tripData.trip.name}" imported successfully!`);
      props.onImported();
      props.onClose();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to import trip');
      console.error(error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal title="Import Trip from YAML" onClose={props.onClose}>
      <div class="space-y-4">
        <div>
          <p class="mb-3 text-sm text-gray-600">
            Select a YAML file to import as a new trip. This will create a new trip with all its bags and items.
          </p>
          <input
            type="file"
            accept=".yaml,.yml"
            onChange={handleFileSelect}
            class="w-full rounded-lg border border-gray-300 px-3 py-2 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <Show when={fileContent()}>
          <div class="rounded-lg bg-gray-50 p-3">
            <p class="text-sm text-gray-600">File loaded: {fileContent().length} characters</p>
          </div>
        </Show>

        <div class="flex gap-2 pt-4">
          <Button onClick={handleImport} disabled={importing() || !fileContent()} class="flex-1">
            {importing() ? 'Importing...' : 'Import'}
          </Button>
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
