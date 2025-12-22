import { createSignal, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { yamlToTrip } from '../../lib/yaml';
import { api, endpoints } from '../../lib/api';

interface TripImportModalProps {
  tripId: string;
  onClose: () => void;
  onImported: () => void;
}

export function TripImportModal(props: TripImportModalProps) {
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

      // Update trip details
      await api.patch(endpoints.trip(props.tripId), {
        name: tripData.trip.name,
        destination: tripData.trip.destination,
        start_date: tripData.trip.start_date,
        end_date: tripData.trip.end_date,
        notes: tripData.trip.notes,
      });

      // Get existing bags to create a mapping from names to IDs
      const bagsResponse = await api.get<any[]>(endpoints.tripBags(props.tripId));
      const existingBags = bagsResponse.data || [];

      // Create or update bags
      const bagNameToId = new Map<string, string>();
      for (const bagData of tripData.bags) {
        const existingBag = existingBags.find((b) => b.name === bagData.name);
        if (existingBag) {
          // Update existing bag
          await api.patch(endpoints.tripBags(props.tripId), {
            bag_id: existingBag.id,
            name: bagData.name,
            type: bagData.type,
            color: bagData.color,
          });
          bagNameToId.set(bagData.name, existingBag.id);
        } else {
          // Create new bag
          const createResponse = await api.post(endpoints.tripBags(props.tripId), {
            name: bagData.name,
            type: bagData.type,
            color: bagData.color,
            sort_order: bagData.sort_order,
          });
          if (createResponse.data) {
            bagNameToId.set(bagData.name, createResponse.data.id);
          }
        }
      }

      // Get existing items to check for duplicates
      const itemsResponse = await api.get<any[]>(endpoints.tripItems(props.tripId));
      const existingItems = itemsResponse.data || [];

      // Create or update items
      let importedCount = 0;
      for (const itemData of tripData.items) {
        const bagId = itemData.bag_name ? bagNameToId.get(itemData.bag_name) || null : null;
        const existingItem = existingItems.find(
          (i) => i.name.toLowerCase() === itemData.name.toLowerCase()
        );

        if (existingItem) {
          // Update existing item
          await api.patch(endpoints.tripItems(props.tripId), {
            id: existingItem.id,
            name: itemData.name,
            category_name: itemData.category_name,
            quantity: itemData.quantity,
            bag_id: bagId,
            is_packed: itemData.is_packed,
          });
        } else {
          // Create new item
          await api.post(endpoints.tripItems(props.tripId), {
            name: itemData.name,
            category_name: itemData.category_name,
            quantity: itemData.quantity,
            bag_id: bagId,
            master_item_id: null,
          });
          importedCount++;
        }
      }

      showToast('success', `Trip imported successfully! ${importedCount} new items added.`);
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
            Select a YAML file to import. This will merge the imported data with your current trip.
            Existing items with the same name will be updated.
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
