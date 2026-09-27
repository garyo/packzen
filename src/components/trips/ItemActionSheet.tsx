/**
 * An item's actions: skip, edit or delete it, or move it to a bag or
 * container in one tap — including a new bag, created on the spot.
 */

import { createSignal, For, Show, type JSX } from 'solid-js';
import type { Bag, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { BAG_COLORS } from '../../lib/color-utils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EditIcon, SkipIcon, TrashIcon } from '../ui/Icons';
import { BagChip, BagFields, DEFAULT_BAG_FIELDS, type BagFieldValues } from '../ui/BagFields';

interface ItemActionSheetProps {
  item: TripItem;
  bags: Bag[];
  containers: TripItem[];
  onMoveToBag: (bagId: string | null) => void;
  onMoveToContainer: (containerId: string) => void;
  /** Create a bag and move the item into it; resolves false if that failed. */
  onMoveToNewBag: (bag: BagFieldValues) => Promise<boolean>;
  onToggleSkipped: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function Action(props: { onClick: () => void; danger?: boolean; children: JSX.Element }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-sm font-medium hover:bg-gray-50"
      classList={{ 'text-red-600': props.danger, 'text-gray-800': !props.danger }}
    >
      {props.children}
    </button>
  );
}

function Destination(props: { current: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.current}
      class="flex w-full items-center gap-3 rounded-lg border px-4 py-2 text-left"
      classList={{
        'border-blue-400 bg-blue-50': props.current,
        'border-gray-200 hover:bg-gray-50': !props.current,
      }}
    >
      {props.children}
      <Show when={props.current}>
        <span class="flex-shrink-0 text-xs text-blue-600">current</span>
      </Show>
    </button>
  );
}

export function ItemActionSheet(props: ItemActionSheetProps) {
  // Act before closing: closing unmounts the sheet and its props with it.
  const act = (action: () => void) => () => {
    action();
    props.onClose();
  };
  const inContainer = () => !!props.item.container_item_id;
  // A container can't go inside another container.
  const containers = () => (props.item.is_container ? [] : props.containers);

  const [newBag, setNewBag] = createSignal<BagFieldValues | null>(null);
  const [saving, setSaving] = createSignal(false);
  const startNewBag = () => {
    const used = new Set(props.bags.map((bag) => bag.color));
    const color = BAG_COLORS.find((c) => !used.has(c.value))?.value ?? DEFAULT_BAG_FIELDS.color;
    setNewBag({ ...DEFAULT_BAG_FIELDS, color });
  };
  const createAndMove = async (bag: BagFieldValues) => {
    setSaving(true);
    const moved = await props.onMoveToNewBag({ ...bag, name: bag.name.trim() });
    setSaving(false);
    if (moved) props.onClose();
  };

  return (
    <Modal title={props.item.name} size="small" onClose={props.onClose}>
      <div class="grid grid-cols-3 gap-2">
        <Action onClick={act(props.onToggleSkipped)}>
          <SkipIcon class="h-5 w-5" />
          {props.item.is_skipped ? 'Unskip' : 'Skip'}
        </Action>
        <Action onClick={act(props.onEdit)}>
          <EditIcon class="h-5 w-5" />
          Edit
        </Action>
        <Action danger onClick={act(props.onDelete)}>
          <TrashIcon class="h-5 w-5" />
          Delete
        </Action>
      </div>

      <h3 class="mt-5 mb-2 text-sm font-medium text-gray-700">Move to</h3>
      <div class="space-y-2">
        <For each={props.bags}>
          {(bag) => (
            <Destination
              current={props.item.bag_id === bag.id && !inContainer()}
              onClick={act(() => props.onMoveToBag(bag.id))}
            >
              <BagChip bag={bag} />
            </Destination>
          )}
        </For>
        <For each={containers()}>
          {(container) => (
            <Destination
              current={props.item.container_item_id === container.id}
              onClick={act(() => props.onMoveToContainer(container.id))}
            >
              <span class="w-4 flex-shrink-0 text-center text-sm" aria-hidden="true">
                📦
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {container.name}
              </span>
            </Destination>
          )}
        </For>
        <Destination
          current={!props.item.bag_id && !inContainer()}
          onClick={act(() => props.onMoveToBag(null))}
        >
          <span class="w-4 flex-shrink-0 text-center text-sm" aria-hidden="true">
            👕
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {NO_BAG_LABEL}
          </span>
        </Destination>
        <Show
          when={newBag()}
          fallback={
            <button
              type="button"
              onClick={startNewBag}
              class="w-full rounded-lg border border-dashed border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-700"
            >
              + New bag…
            </button>
          }
        >
          {(bag) => (
            <form
              ref={(form) => queueMicrotask(() => form.querySelector('input')?.focus())}
              class="space-y-3 rounded-lg border border-gray-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void createAndMove(bag());
              }}
            >
              <BagFields value={bag()} onChange={setNewBag} placeholder="e.g., Backpack" />
              <div class="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setNewBag(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving() || !bag().name.trim()}>
                  {saving() ? 'Creating…' : 'Create and move'}
                </Button>
              </div>
            </form>
          )}
        </Show>
      </div>
    </Modal>
  );
}
