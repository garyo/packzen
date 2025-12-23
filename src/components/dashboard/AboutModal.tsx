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
    minute: '2-digit',
  });
}

export function AboutModal(props: AboutModalProps) {
  return (
    <Modal title="About PackZen" onClose={props.onClose}>
      <div class="space-y-4 text-gray-700">
        <div>
          <h3 class="mb-2 font-semibold text-gray-900">What is PackZen?</h3>
          <p class="text-sm leading-relaxed">
            PackZen is a smart packing list manager that helps you organize your travel essentials.
            Create reusable item lists, manage bag templates, and efficiently pack for any trip.
          </p>
        </div>

        <div>
          <h3 class="mb-2 font-semibold text-gray-900">Features</h3>
          <ul class="list-inside list-disc space-y-1 text-sm">
            <li>Master item library for reusable packing essentials</li>
            <li>Customizable bag templates</li>
            <li>Trip planning with date tracking</li>
            <li>Category organization</li>
            <li>Import/export functionality</li>
            <li>Full backup and restore</li>
          </ul>
        </div>

        <div>
          <h3 class="mb-2 font-semibold text-gray-900">Open Source</h3>
          <p class="text-sm leading-relaxed">
            PackZen is{' '}
            <a
              href="https://github.com/garyo/packzen"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 underline hover:text-blue-800"
            >
              open source software
            </a>{' '}
            released under the{' '}
            <a
              href="https://opensource.org/licenses/MIT"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 underline hover:text-blue-800"
            >
              MIT License
            </a>
            . You're free to use, modify, and distribute this software.
          </p>
        </div>

        <div>
          <h3 class="mb-2 font-semibold text-gray-900">About the Author</h3>
          <p class="text-sm leading-relaxed">
            Created by Gary Oberbrunner.{' '}
            <a
              href="https://oberbrunner.com"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 underline hover:text-blue-800"
            >
              Visit my website
            </a>
          </p>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <p class="text-xs text-gray-500">
            {VERSION_INFO.isDev ? (
              <>Dev Build &middot; {VERSION_INFO.commitHash}</>
            ) : VERSION_INFO.version !== VERSION_INFO.commitHash ? (
              <>
                Version {VERSION_INFO.version} &middot; {VERSION_INFO.commitHash}
              </>
            ) : (
              <>Version {VERSION_INFO.commitHash}</>
            )}
          </p>
          <p class="mt-1 text-xs text-gray-500">Built {formatBuildDate(VERSION_INFO.buildDate)}</p>
          <p class="mt-1 text-xs text-gray-500">Powered by Astro, SolidJS, and Cloudflare</p>
        </div>
      </div>
    </Modal>
  );
}
