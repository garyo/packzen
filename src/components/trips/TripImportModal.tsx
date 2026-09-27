import { createSignal, Show } from 'solid-js';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { yamlToTrip } from '../../lib/yaml';
import { describeTripRestore, restoreTripContents } from '../../lib/backup';

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
      // Merging brings in bags and items; this trip keeps its own name,
      // dates and notes.
      const tripData = yamlToTrip(fileContent());
      const result = await restoreTripContents(props.tripId, tripData, { merge: true });
      showToast(result.failures.length > 0 ? 'error' : 'success', describeTripRestore(result));
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
            Select a YAML file to import. Its bags and items are merged into this trip: items
            already here are updated (and moved to the file's bag), and the rest are added. This
            trip's name, dates and notes stay as they are.
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
