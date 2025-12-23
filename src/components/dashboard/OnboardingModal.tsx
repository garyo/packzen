/**
 * OnboardingModal Component
 *
 * Shows onboarding instructions to new users
 * Displays once per user using localStorage
 */

import { Modal } from '../ui/Modal';

interface OnboardingModalProps {
  onClose: () => void;
}

export function OnboardingModal(props: OnboardingModalProps) {
  return (
    <Modal onClose={props.onClose} title="How To Use PackZen">
      <div class="space-y-4">
        <div class="text-gray-700">
          <ol class="list-inside list-decimal space-y-3">
            <li>
              <strong>Create a trip</strong> using <em>Plan New Trip</em>. Fill in as much or as
              little info as you like.
            </li>
            <li>
              <strong>Add one or more bags</strong>; you can add more any time.
            </li>
            <li>
              <strong>Add Items:</strong> this will autocomplete with your saved items and the
              built-in templates so you can quickly add all the items for your trip. Select the
              category and bag for each item; you can change those later too.
            </li>
            <li>
              <strong>View your packing list.</strong> Check things off as you pack. Drag and drop
              to change bags. Print it out using the three-dots menu.
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
          <h4 class="mb-2 font-semibold text-gray-900">Batch Select</h4>
          <p class="text-sm text-gray-600">
            In the packing list, use <strong>Select Batch</strong> to select multiple items, to move
            them to a bag, category or container.
          </p>
        </div>

        <div class="flex justify-end pt-2">
          <button
            onClick={props.onClose}
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Get Started
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Check if user has seen onboarding
 */
export function hasSeenOnboarding(): boolean {
  return localStorage.getItem('packzen-onboarding-seen') === 'true';
}

/**
 * Mark onboarding as seen
 */
export function markOnboardingAsSeen(): void {
  localStorage.setItem('packzen-onboarding-seen', 'true');
}
