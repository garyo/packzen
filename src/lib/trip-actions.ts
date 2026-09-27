/**
 * Shared trip action utilities
 */

import { api, endpoints } from './api';
import { showToast } from '../components/ui/Toast';
import { confirmDialog } from '../components/ui/ConfirmDialog';

/**
 * Delete a trip with confirmation dialog
 * @param tripId - The ID of the trip to delete
 * @param tripName - The name of the trip (for confirmation message)
 * @param onSuccess - Callback to run after successful deletion
 * @returns true if deleted, false if cancelled or failed
 */
export async function deleteTripWithConfirm(
  tripId: string,
  tripName: string,
  onSuccess: () => void
): Promise<boolean> {
  const confirmed = await confirmDialog({
    title: `Delete "${tripName}"?`,
    message: 'This permanently deletes the trip and its packing list.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!confirmed) return false;

  const response = await api.delete(endpoints.trip(tripId));

  if (response.success) {
    showToast('success', 'Trip deleted');
    onSuccess();
    return true;
  } else {
    showToast('error', response.error || 'Failed to delete trip');
    return false;
  }
}
