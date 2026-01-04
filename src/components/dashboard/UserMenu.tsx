/**
 * UserMenu Component
 *
 * Dropdown menu with user avatar, backup options, and sign out
 */

import { createSignal, onMount, onCleanup, Show, type Accessor } from 'solid-js';
import { authStore } from '../../stores/auth';
import type { MasterItem, Category } from '../../lib/types';
import { showToast } from '../ui/Toast';
import { UserIcon } from '../ui/Icons';
import { downloadYAML } from '../../lib/yaml';
import { exportBackupData, restoreBackupData } from '../../lib/backup';

interface UserMenuProps {
  categories: Accessor<Category[] | undefined>;
  masterItems: Accessor<MasterItem[] | undefined>;
  onBackupRestored: () => void;
  onShowOnboarding: () => void;
}

export function UserMenu(props: UserMenuProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;

  // Handle clicks outside menu and ESC key
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMenu() && menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showMenu()) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    });
  });

  const handleExport = async () => {
    try {
      const { yaml, filename } = await exportBackupData(
        props.categories() || [],
        props.masterItems() || []
      );
      downloadYAML(yaml, filename);
      showToast('success', 'Full backup exported successfully');
      setShowMenu(false);
    } catch (error) {
      showToast('error', 'Failed to export backup');
      console.error(error);
    }
  };

  const handleImport = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (
      !confirm(
        'This will merge the backup with your existing data. Matching items will be updated, and new items will be added. Continue?'
      )
    ) {
      input.value = '';
      return;
    }

    try {
      const text = await file.text();
      await restoreBackupData(text, props.categories() || [], props.masterItems() || []);
      showToast('success', 'Backup restored successfully!');
      props.onBackupRestored();
      setShowMenu(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to restore backup');
      console.error(error);
    } finally {
      input.value = '';
    }
  };

  const handleSignOut = async () => {
    await authStore.signOut();
  };

  return (
    <div class="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu())}
        class="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-80 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
        title="Account menu"
      >
        <Show
          when={authStore.user()?.imageUrl}
          fallback={
            <div class="flex h-full w-full items-center justify-center rounded-full bg-gray-300 text-gray-600">
              <UserIcon class="h-5 w-5" />
            </div>
          }
        >
          <img
            src={authStore.user()!.imageUrl}
            alt="User avatar"
            class="h-full w-full rounded-full"
          />
        </Show>
      </button>

      <Show when={showMenu()}>
        <div class="absolute top-full right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          <Show when={authStore.user()}>
            {(user) => (
              <div class="border-b border-gray-200 px-4 py-3">
                <p class="text-sm font-medium text-gray-900">{user().firstName || user().email}</p>
                <p class="text-xs text-gray-500">{user().email}</p>
              </div>
            )}
          </Show>

          <div class="py-1">
            <a
              href="/profile"
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Account Settings
            </a>
            <a
              href="/pricing"
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Subscription & Pricing
            </a>
            <button
              onClick={() => {
                props.onShowOnboarding();
                setShowMenu(false);
              }}
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Show Onboarding Dialog
            </button>
            <button
              onClick={handleExport}
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Export Backup
            </button>
            <label class="block w-full cursor-pointer px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
              Restore Backup
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml"
                onChange={handleImport}
                class="hidden"
              />
            </label>
          </div>

          <div class="border-t border-gray-200 py-1">
            <button
              onClick={handleSignOut}
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
