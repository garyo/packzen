/**
 * Building blocks shared by PackingListBagView and PackingListCategoryView:
 * drag-and-drop, drop zones, item groups and card wiring.
 */

import { For, Show, createMemo, createSignal, type Accessor, type JSX } from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  createDraggable,
  createDroppable,
  useDragDropContext,
} from '@thisbeyond/solid-dnd';
import type { Bag, Category, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { packingStats } from '../../lib/packing-stats';
import { getCategoryIcon } from '../../lib/built-in-items';
import { PackingItemCard } from './PackingItemCard';
import { liveRectCollision, useAutoScroll, EscapeCancelHandler } from './drag-drop-utils';
import { CheckIcon } from '../ui/Icons';

/** Props both packing list views take. */
export interface PackingListProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  selectMode: Accessor<boolean>;
  selectedItems: Accessor<Set<string>>;
  showUnpackedOnly: Accessor<boolean>;
  onTogglePacked: (item: TripItem) => void;
  onToggleSkipped: (item: TripItem) => void;
  onEditItem: (item: TripItem) => void;
  onToggleItemSelection: (itemId: string) => void;
  onMoveItemToBag: (itemId: string, bagId: string | null) => void;
  onMoveItemToContainer: (itemId: string, containerId: string) => void;
  /** Opens the move sheet; omitted when there's nowhere to move to. */
  onRequestMoveItem?: (item: TripItem) => void;
}

// Virtual bag for items not in any bag. Module-level so it keeps a stable
// identity across recomputes — otherwise <For> rebuilds its section on every
// change (breaking IntersectionObserver re-observe and open menus).
export const NO_BAG: Bag = {
  id: null as unknown as string,
  trip_id: '',
  name: NO_BAG_LABEL,
  type: 'custom',
  color: null,
  sort_order: Number.MAX_SAFE_INTEGER,
  created_at: new Date(0),
};

export const isUnpacked = (item: TripItem) => !item.is_packed && !item.is_skipped;

/** Category icon: the user's category if it has one, else the built-in one. */
export function createCategoryIcons(categories: Accessor<Category[] | undefined>) {
  const icons = createMemo(
    () => new Map((categories() ?? []).map((category) => [category.name, category.icon]))
  );
  return (name: string | null) => (name && icons().get(name)) || getCategoryIcon(name ?? '');
}

// --- Drag and drop ---

interface DragData {
  item: TripItem;
}

export interface DropData {
  type: 'bag' | 'container';
  bagId?: string | null;
  containerId?: string;
  /** Set by drop zones that only accept items of this category. */
  category?: string;
}

/** Move `item` to a drop target: a bag (leaving any container) or a container. */
export function dropInto(props: PackingListProps, item: TripItem, target: DropData) {
  if (target.type === 'bag') props.onMoveItemToBag(item.id, target.bagId ?? null);
  else if (target.containerId) props.onMoveItemToContainer(item.id, target.containerId);
}

/** The dragged item and the drop target under it. Call inside PackDnd. */
export function useDragState() {
  const [state] = useDragDropContext()!;
  return {
    item: () => (state.active.draggable?.data as DragData | undefined)?.item ?? null,
    target: () => (state.active.droppable?.data as DropData | undefined) ?? null,
  };
}

/** Drag-and-drop for a packing list: Escape cancels, edges auto-scroll, a preview follows. */
export function PackDnd(props: {
  onDrop: (item: TripItem, target: DropData) => void;
  children: JSX.Element;
}) {
  const autoScroll = useAutoScroll();
  const [dragged, setDragged] = createSignal<TripItem | null>(null);
  let cancelled = false;
  const finish = () => {
    setDragged(null);
    autoScroll.stop();
  };

  return (
    <DragDropProvider
      onDragStart={({ draggable }) => {
        cancelled = false;
        setDragged((draggable.data as DragData).item);
        autoScroll.start();
      }}
      onDragEnd={({ draggable, droppable }) => {
        finish();
        if (cancelled || !droppable) return;
        props.onDrop((draggable.data as DragData).item, droppable.data as DropData);
      }}
      collisionDetector={liveRectCollision}
    >
      <DragDropSensors />
      <EscapeCancelHandler
        onCancel={() => {
          cancelled = true;
          finish();
        }}
      />
      {props.children}
      <DragOverlay>
        <Show when={dragged()}>
          {(item) => (
            <div class="rounded-lg border border-blue-300 bg-white p-3 shadow-xl ring-2 ring-blue-500">
              <p class="font-medium text-gray-900">{item().name}</p>
              <Show when={item().category_name}>
                <p class="text-sm text-gray-500">{item().category_name}</p>
              </Show>
            </div>
          )}
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}

export interface DropZoneProps {
  id: string;
  data: DropData;
  class?: string;
  /** Classes while an acceptable item hovers over the zone. */
  activeClass: string;
  /** Rejects some items; they get a red highlight instead. */
  accepts?: (item: TripItem) => boolean;
  children: JSX.Element;
}

export function DropZone(props: DropZoneProps) {
  const droppable = createDroppable(props.id, props.data);
  const drag = useDragState();
  const highlight = () => {
    if (!droppable.isActiveDroppable) return '';
    const item = drag.item();
    return !item || !props.accepts || props.accepts(item)
      ? props.activeClass
      : 'bg-red-50 ring-2 ring-red-300';
  };
  return (
    <div
      ref={droppable.ref}
      class={`rounded-lg transition-all duration-150 ${props.class ?? ''} ${highlight()}`}
    >
      {props.children}
    </div>
  );
}

type DragActivators = Record<string, (event: Event) => void>;

function DraggableItem(props: {
  item: TripItem;
  enabled: boolean;
  children: (drag: { activators?: DragActivators; isDragging: boolean }) => JSX.Element;
}) {
  const draggable = createDraggable(props.item.id, { item: props.item } satisfies DragData);
  return (
    <Show when={props.enabled} fallback={<div>{props.children({ isDragging: false })}</div>}>
      <div
        ref={draggable.ref}
        aria-label={`Drag handle: ${props.item.name}`}
        aria-roledescription="draggable item"
      >
        {props.children({
          activators: draggable.dragActivators as DragActivators,
          isDragging: draggable.isActiveDraggable,
        })}
      </div>
    </Show>
  );
}

// --- Items ---

/**
 * One card renderer for both views. Containers also show their contents'
 * progress, and link to their section when `onContainerClick` is given.
 */
export function createCardRenderer(
  props: PackingListProps,
  iconFor: (category: string | null) => string,
  contentsOf: (containerId: string) => TripItem[],
  onContainerClick?: (container: TripItem) => void
) {
  return (item: TripItem) => (
    <DraggableItem item={item} enabled={!props.selectMode()}>
      {(drag) => (
        <PackingItemCard
          item={item}
          selectMode={props.selectMode()}
          isSelected={props.selectedItems().has(item.id)}
          categoryIcon={item.is_container ? iconFor(item.category_name) : undefined}
          containerStats={item.is_container ? packingStats(contentsOf(item.id)) : undefined}
          onContainerClick={
            item.is_container && onContainerClick && contentsOf(item.id).length > 0
              ? () => onContainerClick(item)
              : undefined
          }
          onTogglePacked={() => props.onTogglePacked(item)}
          onToggleSkipped={() => props.onToggleSkipped(item)}
          onEdit={() => props.onEditItem(item)}
          onMoveToBag={props.onRequestMoveItem && (() => props.onRequestMoveItem!(item))}
          onToggleSelection={() => props.onToggleItemSelection(item.id)}
          dragActivators={drag.activators}
          isDragging={drag.isDragging}
        />
      )}
    </DraggableItem>
  );
}

/** Green "All N items packed" note for a fully packed section. */
export function AllPackedNote(props: { count: number }) {
  return (
    <div class="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
      <CheckIcon class="h-4 w-4" />
      All {props.count} items packed
    </div>
  );
}

/** Cards in a responsive grid, plus a collapsed row for packed items the filter hides. */
export function ItemGrid(props: {
  items: TripItem[];
  hiddenPacked: number;
  renderCard: (item: TripItem) => JSX.Element;
}) {
  return (
    <Show when={props.items.length > 0}>
      <div
        class="grid gap-2 md:gap-1.5"
        style="grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr))"
      >
        <For each={props.items}>{(item) => props.renderCard(item)}</For>
        <Show when={props.hiddenPacked > 0}>
          <div class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
            <CheckIcon class="h-4 w-4 text-green-600" />
            {props.hiddenPacked} packed
          </div>
        </Show>
      </div>
    </Show>
  );
}

/**
 * A titled grid of items. With "unpacked only" on it shows the unpacked items
 * and a collapsed "N packed" row, or just the title and packed count once
 * everything is packed.
 */
export function ItemGroup(props: {
  items: TripItem[];
  showUnpackedOnly: boolean;
  renderCard: (item: TripItem) => JSX.Element;
  title: JSX.Element;
  titleClass: string;
  class?: string;
  dropZone?: Omit<DropZoneProps, 'children' | 'class'>;
}) {
  const visible = () => (props.showUnpackedOnly ? props.items.filter(isUnpacked) : props.items);
  const packed = () => packingStats(props.items).packed;
  const allPacked = () => props.showUnpackedOnly && visible().length === 0 && packed() > 0;

  const body = () => (
    <>
      <h3 class={props.titleClass}>
        {props.title}
        <Show when={allPacked()}>
          <span class="ml-1 flex items-center gap-1 text-gray-500">
            ·
            <CheckIcon class="h-3 w-3 text-green-600" />
            {packed()} packed
          </span>
        </Show>
      </h3>
      <ItemGrid
        items={visible()}
        hiddenPacked={props.showUnpackedOnly ? packed() : 0}
        renderCard={props.renderCard}
      />
    </>
  );

  return (
    <Show when={visible().length > 0 || allPacked()}>
      <Show when={props.dropZone} fallback={<div class={props.class}>{body()}</div>}>
        {(zone) => (
          <DropZone {...zone()} class={props.class}>
            {body()}
          </DropZone>
        )}
      </Show>
    </Show>
  );
}
