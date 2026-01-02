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
 * Global pointer position tracker for collision detection.
 * The draggable element position can be offset from the actual pointer,
 * so we track the real pointer position separately.
 */
let globalPointerX = 0;
let globalPointerY = 0;
let pointerTrackerActive = false;

function updateGlobalPointer(e: PointerEvent | TouchEvent) {
  if ('touches' in e && e.touches.length > 0) {
    globalPointerX = e.touches[0].clientX;
    globalPointerY = e.touches[0].clientY;
  } else if ('clientX' in e) {
    globalPointerX = e.clientX;
    globalPointerY = e.clientY;
  }
}

export function startPointerTracking() {
  if (!pointerTrackerActive) {
    document.addEventListener('pointermove', updateGlobalPointer);
    document.addEventListener('touchmove', updateGlobalPointer);
    pointerTrackerActive = true;
  }
}

export function stopPointerTracking() {
  document.removeEventListener('pointermove', updateGlobalPointer);
  document.removeEventListener('touchmove', updateGlobalPointer);
  pointerTrackerActive = false;
}

/**
 * Custom collision detector that uses live getBoundingClientRect() values.
 *
 * When pointer tracking is active (Add Mode), uses the actual pointer position
 * for accurate collision detection across panels. Otherwise, falls back to the
 * draggable element's center (Pack Mode where source and targets are co-located).
 *
 * Prioritizes nested zones: if the point is inside multiple droppables,
 * picks the smallest one (most specific/nested zone).
 *
 * Important: Only returns a droppable if the point is actually inside it.
 * No distance-based fallback to prevent highlighting targets in other panels.
 */
export const liveRectCollision = (
  draggable: DraggableType,
  droppables: DroppableType[],
  _context: { activeDroppableId: Id | null }
): DroppableType | null => {
  // Use pointer position if tracking is active (Add Mode),
  // otherwise use draggable element center (Pack Mode)
  let pointX: number;
  let pointY: number;

  if (pointerTrackerActive) {
    pointX = globalPointerX;
    pointY = globalPointerY;
  } else {
    // Fall back to draggable element center for Pack Mode
    const draggableRect = draggable.node.getBoundingClientRect();
    pointX = draggableRect.left + draggableRect.width / 2;
    pointY = draggableRect.top + draggableRect.height / 2;
  }

  // Find all droppables that actually contain the point
  const containingDroppables: Array<{ droppable: DroppableType; area: number }> = [];

  for (const droppable of droppables) {
    const rect = droppable.node.getBoundingClientRect();

    // Check if point is inside this droppable
    if (
      pointX >= rect.left &&
      pointX <= rect.right &&
      pointY >= rect.top &&
      pointY <= rect.bottom
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

  // Fallback for Pack Mode only: find closest droppable by center distance
  // This helps when the draggable position is slightly off due to scrolling
  // Don't use this fallback in Add Mode (pointer tracking active) to prevent
  // highlighting targets in the wrong panel
  if (!pointerTrackerActive) {
    let closestDroppable: DroppableType | null = null;
    let closestDistance = Infinity;

    for (const droppable of droppables) {
      const rect = droppable.node.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distance = Math.sqrt(Math.pow(centerX - pointX, 2) + Math.pow(centerY - pointY, 2));

      if (distance < closestDistance) {
        closestDistance = distance;
        closestDroppable = droppable;
      }
    }

    return closestDroppable;
  }

  // No droppable contains the point - return null (no highlight)
  return null;
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
 * Auto-scroll for multi-panel layouts (like Add Mode).
 * Only scrolls the specified panel when the pointer is actually within
 * the panel's bounds (both horizontally and vertically).
 * @param getPanelRef - Getter function returning the scroll container element
 */
export function usePanelAutoScroll(getPanelRef: () => HTMLElement | undefined) {
  const EDGE_THRESHOLD = 60;
  const MAX_SCROLL_SPEED = 15;

  let rafId: number | null = null;
  let pointerX = -1;
  let pointerY = -1;

  const updatePointerPosition = (e: PointerEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      pointerX = e.touches[0].clientX;
      pointerY = e.touches[0].clientY;
    } else if ('clientX' in e && 'clientY' in e) {
      pointerX = e.clientX;
      pointerY = e.clientY;
    }
  };

  const scrollLoop = () => {
    const scrollContainer = getPanelRef();
    if (!scrollContainer || pointerX < 0 || pointerY < 0) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();

    // Only scroll if pointer is within the panel's horizontal bounds
    if (pointerX < rect.left || pointerX > rect.right) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }

    const containerTop = rect.top;
    const containerBottom = rect.bottom;

    const topZoneEnd = containerTop + EDGE_THRESHOLD;
    const bottomZoneStart = containerBottom - EDGE_THRESHOLD;

    if (pointerY >= containerTop && pointerY < topZoneEnd) {
      // Near top - scroll up
      const distanceFromTop = pointerY - containerTop;
      const intensity = 1 - distanceFromTop / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      scrollContainer.scrollBy({ left: 0, top: -speed, behavior: 'instant' });
    } else if (pointerY > bottomZoneStart && pointerY <= containerBottom) {
      // Near bottom - scroll down
      const distanceFromBottom = containerBottom - pointerY;
      const intensity = 1 - distanceFromBottom / EDGE_THRESHOLD;
      const speed = Math.max(2, intensity * MAX_SCROLL_SPEED);
      scrollContainer.scrollBy({ left: 0, top: speed, behavior: 'instant' });
    }

    rafId = requestAnimationFrame(scrollLoop);
  };

  const start = () => {
    pointerX = -1;
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
 * Dispatches a synthetic pointerup event to fully end the drag in solid-dnd.
 */
export function EscapeCancelHandler(props: { onCancel: () => void }) {
  // We need the context to exist, but don't use it directly
  useDragDropContext();

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // First call the cancel handler to set our state
        props.onCancel();

        // Then dispatch a synthetic pointerup to end the drag in solid-dnd
        // This stops the library from continuing to track the drag
        const pointerUpEvent = new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'mouse',
        });
        document.dispatchEvent(pointerUpEvent);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  return null;
}
