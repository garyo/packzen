/**
 * AddModeView Component
 *
 * Two-panel view for adding items to trip bags via drag-and-drop.
 * Left panel: Item sources (My Items, Built-in templates)
 * Right panel: Compact bag cards as drop targets
 */

import { createSignal, type Accessor } from 'solid-js';
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
  const [draggedItem, setDraggedItem] = createSignal<SourceItemDragData | null>(null);
  const [dragCancelled, setDragCancelled] = createSignal(false);
  // Selected target for click-to-add (undefined means no selection)
  const [selectedTarget, setSelectedTarget] = createSignal<SelectedTarget | undefined>(undefined);
  let rightPanelRef: HTMLDivElement | undefined;
  const autoScroll = usePanelAutoScroll(() => rightPanelRef);

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

      <div class="flex h-[calc(100vh-8rem)] gap-2 p-2 md:gap-4 md:p-4">
        {/* Left Panel - Item Sources */}
        <div class="flex w-1/2 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
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
        <div class="relative w-1/2">
          <div
            ref={rightPanelRef}
            class="h-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm md:p-4"
          >
            <AddModeBagCards
              items={props.items}
              bags={props.bags}
              categories={props.categories}
              selectedTarget={selectedTarget}
              onSelectTarget={setSelectedTarget}
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
