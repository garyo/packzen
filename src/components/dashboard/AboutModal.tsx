/**
 * AboutModal Component
 *
 * Displays information about the app, license, and author
 */

import { Modal } from '../ui/Modal';
import { VERSION_INFO } from '../../lib/version';

interface AboutModalProps {
  onClose: () => void;
}

function formatBuildDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function AboutModal(props: AboutModalProps) {
  return (
    <Modal title="About PackZen" onClose={props.onClose}>
      <div class="space-y-4 text-gray-700">
        <div>
          <h3 class="font-semibold text-gray-900 mb-2">What is PackZen?</h3>
          <p class="text-sm leading-relaxed">
            PackZen is a smart packing list manager that helps you organize your travel essentials.
            Create reusable item lists, manage bag templates, and efficiently pack for any trip.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-gray-900 mb-2">Features</h3>
          <ul class="text-sm space-y-1 list-disc list-inside">
            <li>Master item library for reusable packing essentials</li>
            <li>Customizable bag templates</li>
            <li>Trip planning with date tracking</li>
            <li>Category organization</li>
            <li>Import/export functionality</li>
            <li>Full backup and restore</li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-gray-900 mb-2">Open Source</h3>
          <p class="text-sm leading-relaxed">
            PackZen is open source software released under the{' '}
            <a
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:text-blue-800 underline"
            >
              MIT License
            </a>
            . You're free to use, modify, and distribute this software.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-gray-900 mb-2">About the Author</h3>
          <p class="text-sm leading-relaxed">
            Created by Gary Oberbrunner.{' '}
            <a
              href="https://oberbrunner.com"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 hover:text-blue-800 underline"
            >
              Visit my website
            </a>
          </p>
        </div>

        <div class="pt-4 border-t border-gray-200">
          <p class="text-xs text-gray-500">
            {VERSION_INFO.isDev ? (
              <>Dev Build &middot; {VERSION_INFO.commitHash}</>
            ) : VERSION_INFO.version !== VERSION_INFO.commitHash ? (
              <>Version {VERSION_INFO.version} &middot; {VERSION_INFO.commitHash}</>
            ) : (
              <>Version {VERSION_INFO.commitHash}</>
            )}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            Built {formatBuildDate(VERSION_INFO.buildDate)}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            Powered by Astro, SolidJS, and Cloudflare
          </p>
        </div>
      </div>
    </Modal>
  );
}
