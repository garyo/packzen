/**
 * AccountMenu Component
 *
 * The Account dialog opened from the app nav: account and plan links, help,
 * full backup/restore, and sign out.
 */

import { Show, type JSX } from 'solid-js';
import { authStore } from '../../stores/auth';
import { api, endpoints } from '../../lib/api';
import type { Category, MasterItem } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { showToast, dismissToast } from '../ui/Toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { downloadYAML } from '../../lib/yaml';
import { exportBackupData, restoreBackupData } from '../../lib/backup';

interface AccountMenuProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
}

// Backups start from the current categories and My Items, fetched on demand
// since the nav doesn't otherwise need them.
async function fetchLibrary(): Promise<{ categories: Category[]; masterItems: MasterItem[] }> {
  const [categories, masterItems] = await Promise.all([
    api.get<Category[]>(endpoints.categories),
    api.get<MasterItem[]>(endpoints.masterItems),
  ]);
  if (!categories.success || !masterItems.success) {
    throw new Error('Could not load your items');
  }
  return { categories: categories.data ?? [], masterItems: masterItems.data ?? [] };
}

export function AccountMenu(props: AccountMenuProps) {
  let fileInputRef: HTMLInputElement | undefined;

  const handleExport = async () => {
    try {
      const { categories, masterItems } = await fetchLibrary();
      const { yaml, filename } = await exportBackupData(categories, masterItems);
      downloadYAML(yaml, filename);
      showToast('success', 'Full backup exported');
      props.onClose();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to export backup');
      console.error(error);
    }
  };

  const handleRestore = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const confirmed = await confirmDialog({
      title: 'Restore backup?',
      message:
        'This merges the backup with your existing data. Matching items are updated and new items are added.',
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;

    const progressToast = showToast('info', 'Restoring backup…', { duration: 0 });
    try {
      const { categories, masterItems } = await fetchLibrary();
      await restoreBackupData(await file.text(), categories, masterItems);
      showToast('success', 'Backup restored. Reloading…');
      // Every page's data may have changed; a reload is the simplest refresh.
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to restore backup');
      console.error(error);
    } finally {
      dismissToast(progressToast);
    }
  };

  return (
    <Modal title="Account" size="small" onClose={props.onClose}>
      <Show when={authStore.user()}>
        {(user) => (
          <div class="mb-3 border-b border-gray-200 pb-3">
            <p class="font-medium text-gray-900">{user().firstName || user().email}</p>
            <p class="text-sm text-gray-600">{user().email}</p>
          </div>
        )}
      </Show>

      <nav class="flex flex-col" aria-label="Account">
        <MenuLink href="/profile">Account settings</MenuLink>
        <MenuLink href="/pricing">Plan & pricing</MenuLink>
        <MenuButton onClick={props.onShowHelp}>How PackZen works</MenuButton>
        <MenuButton onClick={props.onShowAbout}>About PackZen</MenuButton>

        <div class="my-2 border-t border-gray-200" />
        <MenuButton onClick={handleExport}>Export backup</MenuButton>
        <MenuButton onClick={() => fileInputRef?.click()}>Restore backup…</MenuButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleRestore}
          class="hidden"
        />

        <div class="my-2 border-t border-gray-200" />
        <MenuButton onClick={() => authStore.signOut()}>Sign out</MenuButton>
      </nav>
    </Modal>
  );
}

const itemClass = 'flex items-center rounded-md px-3 text-left text-gray-800 hover:bg-gray-100';

function MenuLink(props: { href: string; children: JSX.Element }) {
  return (
    <a href={props.href} class={itemClass}>
      {props.children}
    </a>
  );
}

function MenuButton(props: { onClick: () => void; children: JSX.Element }) {
  return (
    <button type="button" onClick={props.onClick} class={itemClass}>
      {props.children}
    </button>
  );
}
