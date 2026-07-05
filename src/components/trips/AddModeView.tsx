/**
 * AddModeView Component
 *
 * Two-panel view for adding items to trip bags via drag-and-drop.
 * Left panel: Item sources (My Saved Items, Built-in templates)
 * Right panel: Compact bag cards as drop targets
 */

import { createSignal, createEffect, createMemo, onCleanup, Show, type Accessor } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  type DragEvent,
} from '@thisbeyond/solid-dnd';
import type { TripItem, Bag, Category, MasterItemWithCategory } from '../../lib/types';
import { AddModeLeftPanel } from './AddModeLeftPanel';
import { AddModeBagCards } from './AddModeBagCards';
import {
  liveRectCollision,
  usePanelAutoScroll,
  EscapeCancelHandler,
  startPointerTracking,
  stopPointerTracking,
} from './drag-drop-utils';

interface AddModeViewProps {
  tripId: string;
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  masterItems: Accessor<MasterItemWithCategory[] | undefined>;
  onAddMasterItem: (
    item: MasterItemWithCategory,
    bagId: string | null,
    containerId: string | null
  ) => Promise<void>;
  onAddBuiltInItem: (
    item: { name: string; description: string | null; category: string; quantity: number },
    bagId: string | null,
    containerId: string | null
  ) => Promise<void>;
  onRemoveFromTrip?: (tripItemId: string) => Promise<void>;
  onAddNewItem?: () => void;
  onManageBags?: () => void;
  onBagReplaced?: () => void;
}

// Drag data types for Add Mode
export interface SourceItemDragData {
  type: 'source-item';
  sourceType: 'master' | 'built-in';
  masterItem?: MasterItemWithCategory;
  builtInItem?: {
    name: string;
    description: string | null;
    category: string;
    quantity: number;
    is_container?: boolean;
  };
}

export interface AddModeBagDropData {
  type: 'add-mode-bag' | 'add-mode-container';
  bagId: string | null;
  containerId?: string;
}

// Selected target for click-to-add
export interface SelectedTarget {
  bagId: string | null;
  containerId: string | null;
}

export function AddModeView(props: AddModeViewProps) {
  const [activeTab, setActiveTab] = createSignal<'my-items' | 'built-in'>('my-items');

  // Auto-select Built-in tab if the user has no saved items
  let hasSetInitialTab = false;
  createEffect(() => {
    const items = props.masterItems();
    if (!hasSetInitialTab && items !== undefined) {
      hasSetInitialTab = true;
      if (items.length === 0) {
        setActiveTab('built-in');
      }
    }
  });

  const [draggedItem, setDraggedItem] = createSignal<SourceItemDragData | null>(null);
  const [dragCancelled, setDragCancelled] = createSignal(false);
  // Selected target for click-to-add (undefined means no selection)
  const [selectedTarget, setSelectedTarget] = createSignal<SelectedTarget | undefined>(undefined);
  // Which pane is visible on mobile (<md). At md+ both panes show side-by-side.
  const [mobilePane, setMobilePane] = createSignal<'items' | 'bags'>('bags');
  let rightPanelRef: HTMLDivElement | undefined;

  // Choose a target and, on mobile, jump to the Items pane so the user can tap "+".
  const handleSelectTarget = (target: SelectedTarget | undefined) => {
    setSelectedTarget(target);
    if (target) setMobilePane('items');
  };

  // Human-readable name of the current target for the mobile "Adding to:" bar.
  const selectedTargetName = createMemo(() => {
    const target = selectedTarget();
    if (!target) return undefined;
    if (target.containerId) {
      const container = props.items()?.find((i) => i.id === target.containerId);
      return container?.name ?? 'Container';
    }
    if (target.bagId === null) return 'No Bag';
    return props.bags()?.find((b) => b.id === target.bagId)?.name ?? 'Bag';
  });

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

    // User pressed ESC to cancel
    if (wasCancelled) return;

    // No valid drop target - cancel (includes dropping on left panel)
    if (!droppable) return;

    const dragData = draggable.data as SourceItemDragData;
    const dropData = droppable.data as AddModeBagDropData;

    // Only process source items dropped on bag/container targets
    if (dragData?.type !== 'source-item') return;
    if (dropData?.type !== 'add-mode-bag' && dropData?.type !== 'add-mode-container') return;

    const bagId = dropData.type === 'add-mode-bag' ? dropData.bagId : null;
    const containerId =
      dropData.type === 'add-mode-container' ? (dropData.containerId ?? null) : null;

    if (dragData.sourceType === 'master' && dragData.masterItem) {
      await props.onAddMasterItem(dragData.masterItem, bagId, containerId);
    } else if (dragData.sourceType === 'built-in' && dragData.builtInItem) {
      await props.onAddBuiltInItem(dragData.builtInItem, bagId, containerId);
    }
  };

  const getDraggedItemName = () => {
    const data = draggedItem();
    if (!data) return '';
    if (data.sourceType === 'master' && data.masterItem) {
      return data.masterItem.name;
    }
    if (data.sourceType === 'built-in' && data.builtInItem) {
      return data.builtInItem.name;
    }
    return '';
  };

  const handleCancel = () => {
    setDragCancelled(true);
    setDraggedItem(null);
    stopPointerTracking();
    autoScroll.stop();
  };

  // Handle click-to-add for items
  const handleAddToSelectedBag = async (dragData: SourceItemDragData) => {
    const target = selectedTarget();
    if (!target) return; // No target selected

    if (dragData.sourceType === 'master' && dragData.masterItem) {
      await props.onAddMasterItem(dragData.masterItem, target.bagId, target.containerId);
    } else if (dragData.sourceType === 'built-in' && dragData.builtInItem) {
      await props.onAddBuiltInItem(dragData.builtInItem, target.bagId, target.containerId);
    }
  };

  return (
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetector={liveRectCollision}
    >
      <DragDropSensors />
      <EscapeCancelHandler onCancel={handleCancel} />

      <div class="flex h-[calc(100vh-8rem)] flex-col">
        {/* Mobile-only controls: pane toggle + "Adding to:" target bar (hidden at md+) */}
        <div class="flex flex-col gap-2 px-2 pt-2 md:hidden">
          <div class="flex rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              class="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors"
              classList={{
                'bg-white text-blue-600 shadow-sm': mobilePane() === 'items',
                'text-gray-600': mobilePane() !== 'items',
              }}
              onClick={() => setMobilePane('items')}
            >
              Items
            </button>
            <button
              type="button"
              class="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors"
              classList={{
                'bg-white text-blue-600 shadow-sm': mobilePane() === 'bags',
                'text-gray-600': mobilePane() !== 'bags',
              }}
              onClick={() => setMobilePane('bags')}
            >
              Bags
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMobilePane('bags')}
            class="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm shadow-sm"
          >
            <Show
              when={selectedTargetName()}
              fallback={<span class="text-gray-500">Tap a bag to choose where items go</span>}
            >
              <span class="min-w-0 flex-1 truncate text-gray-700">
                Adding to: <span class="font-semibold text-gray-900">{selectedTargetName()}</span>
              </span>
            </Show>
            <span class="flex-shrink-0 text-xs font-medium text-blue-600">Change</span>
          </button>
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
              categories={props.categories}
              onRemoveFromTrip={props.onRemoveFromTrip}
              onAddNewItem={props.onAddNewItem}
              isDragging={() => draggedItem() !== null}
              selectedTarget={selectedTarget}
              onAddToSelectedBag={handleAddToSelectedBag}
            />
          </div>

          {/* Right Panel - Bag Cards */}
          <div
            class="relative w-full md:block md:w-1/2"
            classList={{ 'hidden md:block': mobilePane() !== 'bags' }}
          >
            <div
              ref={rightPanelRef}
              class="h-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm md:p-4"
            >
              <AddModeBagCards
                tripId={props.tripId}
                items={props.items}
                bags={props.bags}
                categories={props.categories}
                onBagReplaced={props.onBagReplaced}
                selectedTarget={selectedTarget}
                onSelectTarget={handleSelectTarget}
              />
            </div>
            {/* Manage Bags FAB */}
            {props.onManageBags && (
              <button
                type="button"
                onClick={props.onManageBags}
                class="absolute right-2 bottom-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 md:right-3 md:bottom-3 md:h-12 md:w-12"
                title="Manage bags"
              >
                <svg
                  class="h-5 w-5 md:h-6 md:w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drag Overlay - pointer-events:none so it doesn't block auto-scroll detection */}
      <DragOverlay>
        {draggedItem() && (
          <div class="pointer-events-none rounded-lg border border-blue-300 bg-white px-4 py-2 shadow-xl">
            <span class="font-medium text-gray-900">{getDraggedItemName()}</span>
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
