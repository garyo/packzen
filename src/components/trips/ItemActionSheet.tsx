/**
 * An item's actions: skip, edit or delete it, or move it to a bag or
 * container in one tap.
 */

import { For, Show, type JSX } from 'solid-js';
import type { Bag, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { Modal } from '../ui/Modal';
import { EditIcon, SkipIcon, TrashIcon } from '../ui/Icons';
import { BagChip } from './BagFields';

interface ItemActionSheetProps {
  item: TripItem;
  bags: Bag[];
  containers: TripItem[];
  onMoveToBag: (bagId: string | null) => void;
  onMoveToContainer: (containerId: string) => void;
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

      <Show when={props.bags.length > 0 || containers().length > 0}>
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
        </div>
      </Show>
    </Modal>
  );
}
