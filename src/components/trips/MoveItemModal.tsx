/**
 * One-tap sheet for moving an item to a bag, a container, or out of any bag.
 */

import { For, Show } from 'solid-js';
import type { Bag, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { Modal } from '../ui/Modal';

interface MoveItemModalProps {
  item: TripItem;
  bags: Bag[];
  containers: TripItem[];
  onMoveToBag: (bagId: string | null) => void;
  onMoveToContainer: (containerId: string) => void;
  onClose: () => void;
}

function Destination(props: { icon: string; name: string; current: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      class="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
      classList={{ 'border-blue-400 bg-blue-50': props.current }}
    >
      <span class="text-lg">{props.icon}</span>
      <span class="min-w-0 flex-1 truncate font-medium text-gray-900">{props.name}</span>
      <Show when={props.current}>
        <span class="text-xs text-blue-600">current</span>
      </Show>
    </button>
  );
}

export function MoveItemModal(props: MoveItemModalProps) {
  const choose = (move: () => void) => {
    move();
    props.onClose();
  };

  return (
    <Modal title="Move item" size="small" onClose={props.onClose}>
      <div class="space-y-2">
        <For each={props.bags}>
          {(bag) => (
            <Destination
              icon="👜"
              name={bag.name}
              current={props.item.bag_id === bag.id && !props.item.container_item_id}
              onClick={() => choose(() => props.onMoveToBag(bag.id))}
            />
          )}
        </For>
        {/* A container can't go inside another container */}
        <Show when={!props.item.is_container}>
          <For each={props.containers}>
            {(container) => (
              <Destination
                icon="📦"
                name={container.name}
                current={props.item.container_item_id === container.id}
                onClick={() => choose(() => props.onMoveToContainer(container.id))}
              />
            )}
          </For>
        </Show>
        <Destination
          icon="🧺"
          name={NO_BAG_LABEL}
          current={!props.item.bag_id && !props.item.container_item_id}
          onClick={() => choose(() => props.onMoveToBag(null))}
        />
      </div>
    </Modal>
  );
}
