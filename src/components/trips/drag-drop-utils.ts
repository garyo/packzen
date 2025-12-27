/**
 * Shared drag-and-drop utilities for packing list views
 */

import { onMount, onCleanup } from 'solid-js';
import {
  useDragDropContext,
  type Draggable as DraggableType,
  type Droppable as DroppableType,
  type Id,
} from '@thisbeyond/solid-dnd';

/**
 * Custom collision detector that uses live getBoundingClientRect() values
 * instead of cached layouts. This handles scrolling correctly without drift.
 *
 * Prioritizes nested zones: if the drag point is inside multiple droppables,
 * picks the smallest one (most specific/nested zone).
 */
export const liveRectCollision = (
  draggable: DraggableType,
  droppables: DroppableType[],
  _context: { activeDroppableId: Id | null }
): DroppableType | null => {
  const draggableRect = draggable.node.getBoundingClientRect();
  const draggableCenter = {
    x: draggableRect.left + draggableRect.width / 2,
    y: draggableRect.top + draggableRect.height / 2,
  };

  // First pass: find all droppables that actually contain the drag point
  const containingDroppables: Array<{ droppable: DroppableType; area: number }> = [];

  for (const droppable of droppables) {
    const rect = droppable.node.getBoundingClientRect();

    // Check if drag center is inside this droppable
    if (
      draggableCenter.x >= rect.left &&
      draggableCenter.x <= rect.right &&
      draggableCenter.y >= rect.top &&
      draggableCenter.y <= rect.bottom
    ) {
      // Calculate area (prefer smaller/more specific zones)
      const area = rect.width * rect.height;
      containingDroppables.push({ droppable, area });
    }
  }

  // If any droppables contain the point, pick the smallest one (most nested)
  if (containingDroppables.length > 0) {
    containingDroppables.sort((a, b) => a.area - b.area);
    return containingDroppables[0].droppable;
  }

  // Fallback: if no droppables contain the point, use center-to-center distance
  let closestDroppable: DroppableType | null = null;
  let closestDistance = Infinity;

  for (const droppable of droppables) {
    const rect = droppable.node.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const distance = Math.sqrt(
      Math.pow(center.x - draggableCenter.x, 2) + Math.pow(center.y - draggableCenter.y, 2)
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestDroppable = droppable;
    }
  }

  return closestDroppable;
};

/**
 * Auto-scroll when dragging near edges of scroll container.
 * Works with the main content area as the scroll container.
 */
export function useAutoScroll() {
  const EDGE_THRESHOLD = 60; // pixels from edge to start scrolling
  const MAX_SCROLL_SPEED = 15; // pixels per frame at max intensity

  let rafId: number | null = null;
  let pointerY = -1;

  const updatePointerPosition = (e: PointerEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      pointerY = e.touches[0].clientY;
    } else if ('clientY' in e) {
      pointerY = e.clientY;
    }
  };

  const scrollLoop = () => {
    // Find the scroll container (main element with overflow-y-auto)
    const scrollContainer = document.querySelector('main.overflow-y-auto') as HTMLElement | null;
    if (!scrollContainer) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const containerTop = rect.top;
    const containerBottom = rect.bottom;

    // Calculate scroll zones relative to the scroll container
    const topZoneEnd = containerTop + EDGE_THRESHOLD;
    const bottomZoneStart = containerBottom - EDGE_THRESHOLD;

    if (pointerY >= 0 && pointerY >= containerTop && pointerY < topZoneEnd) {
      // Near top of scroll container - scroll up
      const distanceFromTop = pointerY - containerTop;
      const intensity = 1 - distanceFromTop / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      scrollContainer.scrollBy({ left: 0, top: -speed, behavior: 'instant' });
    } else if (pointerY >= 0 && pointerY > bottomZoneStart && pointerY <= containerBottom) {
      // Near bottom of scroll container - scroll down
      const distanceFromBottom = containerBottom - pointerY;
      const intensity = 1 - distanceFromBottom / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      scrollContainer.scrollBy({ left: 0, top: speed, behavior: 'instant' });
    }

    rafId = requestAnimationFrame(scrollLoop);
  };

  const start = () => {
    pointerY = -1;
    document.addEventListener('pointermove', updatePointerPosition);
    document.addEventListener('touchmove', updatePointerPosition);
    rafId = requestAnimationFrame(scrollLoop);
  };

  const stop = () => {
    document.removeEventListener('pointermove', updatePointerPosition);
    document.removeEventListener('touchmove', updatePointerPosition);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return { start, stop };
}

/**
 * ESC key handler to cancel drag operations.
 * Must be used inside a DragDropProvider.
 */
export function EscapeCancelHandler(props: { onCancel: () => void }) {
  // We need the context to exist, but don't use it directly
  useDragDropContext();

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        props.onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return null;
}
