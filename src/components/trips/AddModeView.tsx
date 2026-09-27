/**
 * AddModeView Component
 *
 * Add mode: item sources (My Items, Suggestions) beside the trip's bags.
 * Tapping an item adds it to the current target — the first bag until you
 * pick another. On desktop items can also be dragged onto a bag. Phones show
 * one pane at a time: items, or the bags to choose a target from.
 */

import { createEffect, createSignal, createMemo, onCleanup, Show, type Accessor } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  type DragEvent,
} from '@thisbeyond/solid-dnd';
import type { TripItem, Bag, MasterItemWithCategory, SelectedBuiltInItem } from '../../lib/types';
import type { AddOptions } from '../../lib/trip-item-adder';
import type { StarterModifier } from '../../lib/built-in-items';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { byName } from '../../lib/item-placement';
import { AddModeLeftPanel } from './AddModeLeftPanel';
import { AddModeBagCards } from './AddModeBagCards';
import { BagSwatch } from './BagFields';
import {
  liveRectCollision,
  usePanelAutoScroll,
  EscapeCancelHandler,
  startPointerTracking,
  stopPointerTracking,
} from './drag-drop-utils';

interface AddModeViewProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  onAddItems: (
    items: SelectedBuiltInItem[],
    bagId: string | null,
    containerId: string | null,
    options?: AddOptions
  ) => Promise<void>;
  onAddStarter: (
    tripTypeId: string,
    modifiers: StarterModifier[],
    bagId: string | null
  ) => Promise<number>;
  onRemoveFromTrip: (tripItemId: string) => void;
  /** Open the new-item form aimed at the current target, optionally with a name filled in. */
  onAddNewItem: (target: SelectedTarget, name?: string) => void;
  onManageBags: () => void;
  onReplaceBag: (bag: Bag) => void;
}

// A My Items entry or a suggestion, dragged from the left panel.
export interface SourceItemDragData {
  type: 'source-item';
  item: SelectedBuiltInItem;
}

export interface AddModeBagDropData {
  type: 'add-mode-bag' | 'add-mode-container';
  bagId: string | null;
  containerId?: string;
}

/** Where tapped items go: a bag (null = not in a bag) or a container. */
export interface SelectedTarget {
  bagId: string | null;
  containerId: string | null;
}

export function AddModeView(props: AddModeViewProps) {
  const [activeTab, setActiveTab] = createSignal<'my-items' | 'built-in'>('my-items');
  // Start on Suggestions when there are no saved items yet.
  let initialTabSet = false;
  createEffect(() => {
    const masterItems = props.masterItems();
    if (initialTabSet || masterItems === undefined) return;
    initialTabSet = true;
    if (masterItems.length === 0) setActiveTab('built-in');
  });

  const [draggedItem, setDraggedItem] = createSignal<SourceItemDragData | null>(null);
  const [dragCancelled, setDragCancelled] = createSignal(false);
  const [chosenTarget, setChosenTarget] = createSignal<SelectedTarget>();
  // The chosen target while it exists (it may be deleted, here or on another
  // device); otherwise the first bag, as the bags pane lists them.
  const selectedTarget = createMemo((): SelectedTarget => {
    const target = chosenTarget();
    const exists =
      target &&
      (target.containerId
        ? props.items()?.some((item) => item.id === target.containerId)
        : target.bagId === null || props.bags()?.some((bag) => bag.id === target.bagId));
    if (exists) return target;
    const firstBag = [...(props.bags() ?? [])].sort(byName)[0];
    return { bagId: firstBag?.id ?? null, containerId: null };
  });
  // Which pane phones show (<md). At md+ both panes show side-by-side.
  const [mobilePane, setMobilePane] = createSignal<'items' | 'bags'>('items');
  let rightPanelRef: HTMLDivElement | undefined;

  const handleSelectTarget = (target: SelectedTarget) => {
    setChosenTarget(target);
    setMobilePane('items');
  };

  const targetContainer = () => {
    const id = selectedTarget().containerId;
    return id ? props.items()?.find((item) => item.id === id) : undefined;
  };
  const targetBag = () => props.bags()?.find((bag) => bag.id === selectedTarget().bagId);

  const autoScroll = usePanelAutoScroll(() => rightPanelRef);

  // If this view unmounts mid-drag (e.g. navigating away), the drag never
  // reaches handleDragEnd/handleCancel, which would otherwise leave the
  // module-global pointer tracker's listeners attached and its "active" flag
  // stuck on - corrupting collision detection for the pack views, which
  // share this module. Tearing down here unconditionally is safe: stopping
  // an already-stopped tracker is a no-op.
  onCleanup(() => {
    stopPointerTracking();
    autoScroll.stop();
  });

  const handleDragStart = (event: DragEvent) => {
    const data = event.draggable.data as SourceItemDragData;
    if (data?.type === 'source-item') {
      setDraggedItem(data);
      setDragCancelled(false);
      startPointerTracking();
      autoScroll.start();
    }
  };

  const handleDragEnd = async (event: DragEvent) => {
    const { draggable, droppable } = event;
    const wasCancelled = dragCancelled();
    setDraggedItem(null);
    setDragCancelled(false);
    stopPointerTracking();
    autoScroll.stop();

    if (wasCancelled || !droppable) return;

    const dragData = draggable.data as SourceItemDragData;
    const dropData = droppable.data as AddModeBagDropData;
    if (dragData?.type !== 'source-item') return;
    if (dropData?.type !== 'add-mode-bag' && dropData?.type !== 'add-mode-container') return;

    const bagId = dropData.type === 'add-mode-bag' ? dropData.bagId : null;
    const containerId =
      dropData.type === 'add-mode-container' ? (dropData.containerId ?? null) : null;
    await props.onAddItems([dragData.item], bagId, containerId);
  };

  const handleCancel = () => {
    setDragCancelled(true);
    setDraggedItem(null);
    stopPointerTracking();
    autoScroll.stop();
  };

  const addToTarget = (items: SelectedBuiltInItem[], options?: AddOptions) =>
    props.onAddItems(items, selectedTarget().bagId, selectedTarget().containerId, options);

  // Starter lists go in a bag; a container target means its bag.
  const addStarterToTarget = (tripTypeId: string, modifiers: StarterModifier[]) =>
    props.onAddStarter(tripTypeId, modifiers, targetContainer()?.bag_id ?? selectedTarget().bagId);

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetector={liveRectCollision}
    >
      <DragDropSensors />
      <EscapeCancelHandler onCancel={handleCancel} />

      <div class="flex h-full flex-col">
        {/* Phones: where tapped items go, and the way to change it */}
        <div class="px-2 pt-2 md:hidden">
          <Show
            when={mobilePane() === 'items'}
            fallback={
              <div class="flex items-center justify-between gap-2 px-1">
                <span class="text-sm text-gray-600">Tap a bag to add items to it</span>
                <button
                  type="button"
                  onClick={() => setMobilePane('items')}
                  class="rounded-md px-3 text-sm font-medium text-blue-600"
                >
                  Back to items
                </button>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => setMobilePane('bags')}
              class="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-left text-sm shadow-sm"
            >
              <span class="text-gray-600">Adding to</span>
              <Show
                when={targetContainer()}
                fallback={
                  <Show when={targetBag()} fallback={<span>👕</span>}>
                    {(bag) => <BagSwatch color={bag().color} class="h-3 w-3" />}
                  </Show>
                }
              >
                <span>📦</span>
              </Show>
              <span class="min-w-0 flex-1 truncate font-semibold text-gray-900">
                {targetContainer()?.name ?? targetBag()?.name ?? NO_BAG_LABEL}
              </span>
              <span class="flex-shrink-0 font-medium text-blue-600">Change</span>
            </button>
          </Show>
        </div>

        <div class="flex min-h-0 flex-1 gap-2 p-2 md:gap-4 md:p-4">
          {/* Left Panel - Item Sources */}
          <div
            class="w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:w-1/2"
            classList={{
              flex: mobilePane() === 'items',
              'hidden md:flex': mobilePane() !== 'items',
            }}
          >
            <AddModeLeftPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              items={props.items}
              masterItems={props.masterItems}
              onRemoveFromTrip={props.onRemoveFromTrip}
              onAddNewItem={(name) => props.onAddNewItem(selectedTarget(), name)}
              isDragging={() => draggedItem() !== null}
              onAdd={(item) => addToTarget([item], { quiet: true })}
              onAddAll={addToTarget}
              onAddStarter={addStarterToTarget}
            />
          </div>

          {/* Right Panel - Bag Cards */}
          <div
            class="w-full md:block md:w-1/2"
            classList={{ 'hidden md:block': mobilePane() !== 'bags' }}
          >
            <div
              ref={rightPanelRef}
              class="h-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-sm md:p-4"
            >
              <AddModeBagCards
                items={props.items}
                bags={props.bags}
                onReplaceBag={props.onReplaceBag}
                selectedTarget={selectedTarget}
                onSelectTarget={handleSelectTarget}
              />
              <button
                type="button"
                onClick={props.onManageBags}
                class="mt-3 w-full rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-700"
              >
                Add or edit bags…
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay - pointer-events:none so it doesn't block auto-scroll detection */}
      <DragOverlay>
        {draggedItem() && (
          <div class="pointer-events-none rounded-lg border border-blue-300 bg-white px-4 py-2 shadow-xl">
            <span class="font-medium text-gray-900">{draggedItem()!.item.name}</span>
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
