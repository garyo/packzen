/**
 * OnboardingModal Component
 *
 * The full "How PackZen works" walkthrough, opened on demand from the Account
 * menu rather than auto-firing. Day-to-day guidance is contextual (empty
 * states, the container checkbox label), so there's no per-browser flag.
 */

import { Modal } from '../ui/Modal';

interface OnboardingModalProps {
  onClose: () => void;
}

export function OnboardingModal(props: OnboardingModalProps) {
  return (
    <Modal onClose={props.onClose} title="How PackZen works">
      <div class="space-y-4">
        <div class="text-gray-700">
          <ol class="list-inside list-decimal space-y-3">
            <li>
              <strong>Create a trip</strong> with <em>+ New Trip</em> on My Trips. Fill in as much
              or as little as you like.
            </li>
            <li>
              <strong>Add one or more bags</strong>; you can add more any time.
            </li>
            <li>
              <strong>Add items</strong> from your saved items (My Items) or from{' '}
              <em>Suggestions</em>, curated lists for each kind of trip. Pick a category and bag for
              each item; you can change those later too.
            </li>
            <li>
              <strong>Pack.</strong> Check things off as you pack, and drag items to change bags. To
              print your list, use the printer icon at the top of the trip.
            </li>
          </ol>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <h4 class="mb-2 font-semibold text-gray-900">Containers</h4>
          <p class="text-sm text-gray-600">
            Some items go in <i>containers</i> inside bags, like a toilet kit or camera bag. When
            adding these items, mark them as a container; then you can add items directly to them.
          </p>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <h4 class="mb-2 font-semibold text-gray-900">Selecting several items</h4>
          <p class="text-sm text-gray-600">
            In the packing list, use <strong>Select</strong> to pick several items at once and move
            them to a bag, category or container.
          </p>
        </div>

        <div class="flex justify-end pt-2">
          <button
            onClick={props.onClose}
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
