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
 * Auto-scroll when dragging near viewport edges.
 * Accounts for sticky headers.
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
    const viewportHeight = window.innerHeight;

    // Get the sticky header's bottom edge to find where visible content starts
    const header = document.querySelector('header.sticky');
    const contentTop = header ? header.getBoundingClientRect().bottom : 0;

    // Calculate scroll zones relative to the visible content area
    const topZoneEnd = contentTop + EDGE_THRESHOLD;
    const bottomZoneStart = viewportHeight - EDGE_THRESHOLD;

    if (pointerY >= 0 && pointerY >= contentTop && pointerY < topZoneEnd) {
      // Near top of visible content - scroll up
      const distanceFromTop = pointerY - contentTop;
      const intensity = 1 - distanceFromTop / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      window.scrollBy({ left: 0, top: -speed, behavior: 'instant' });
    } else if (pointerY >= 0 && pointerY > bottomZoneStart) {
      // Near bottom - scroll down
      const distanceFromBottom = viewportHeight - pointerY;
      const intensity = 1 - distanceFromBottom / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      window.scrollBy({ left: 0, top: speed, behavior: 'instant' });
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
