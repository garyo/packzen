/**
 * OnboardingModal Component
 *
 * The full "How PackZen works" walkthrough, opened on demand from the Account
 * menu or a new user's My Trips rather than auto-firing. Day-to-day guidance is contextual (empty
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
              <strong>Start a trip.</strong> Pick a kind of trip to begin with a ready-made list of
              essentials, or use <em>+ New Trip</em> on My Trips to set one up yourself. Tap the
              trip's name to rename it or add dates.
            </li>
            <li>
              <strong>Add items.</strong> Switch the trip to <em>Add</em> and tap anything from My
              Items (things you've added before) or <em>Suggestions</em>; it goes into the bag shown
              at the top, and <em>Change</em> picks another. Can't find something? Search for it and
              add it by name.
            </li>
            <li>
              <strong>Pack.</strong> Switch back to <em>Pack</em> and tap items to check them off.
              An item's <strong>⋯</strong> button moves it to another bag, skips it for this trip,
              or edits it. The printer icon prints your list.
            </li>
          </ol>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <h4 class="mb-2 font-semibold text-gray-900">Bags</h4>
          <p class="text-sm text-gray-600">
            Bags are optional. Add or change them with <strong>Bags…</strong> in a trip's ⋮ menu.
          </p>
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
            <strong>Select</strong> in a trip's ⋮ menu lets you pick several items at once and move
            them to a bag, category or container, skip them, or delete them.
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
