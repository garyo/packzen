/**
 * SwipeToReveal Component
 *
 * iOS Mail-style swipe gesture to reveal action buttons.
 * Swipe left to reveal actions, swipe right or tap elsewhere to close.
 */

import { createEffect, onMount, onCleanup, type JSX, type Accessor } from 'solid-js';

// Swipe configuration constants
const VELOCITY_THRESHOLD = 0.3; // px/ms for quick swipe detection
const DIRECTION_LOCK_THRESHOLD = 10; // Movement to determine direction
const EDGE_RESISTANCE = 0.3; // Resistance when pulling past bounds

interface SwipeToRevealProps {
  itemId: string;
  revealedItemId: Accessor<string | null>;
  onRevealChange: (itemId: string | null) => void;
  actionsWidth?: number; // Width of actions container, default 120px
  children: JSX.Element; // Main card content
  actions: JSX.Element; // Action buttons to reveal
  disabled?: boolean; // Disable swipe (e.g., during drag-drop)
}

export function SwipeToReveal(props: SwipeToRevealProps) {
  const actionsWidth = () => props.actionsWidth ?? 120;

  let containerRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;

  // Touch tracking state
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let currentOffset = 0;
  let isHorizontalSwipe: boolean | null = null;
  let isDragging = false;

  // Check if this item is currently revealed
  const isRevealed = () => props.revealedItemId() === props.itemId;

  // Update transform without triggering reactivity (for smooth dragging)
  const setTransform = (offset: number, transition = false) => {
    if (!contentRef) return;
    contentRef.style.transition = transition
      ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      : 'none';
    contentRef.style.transform = `translateX(${offset}px)`;
  };

  // Snap to revealed or closed state
  const snapTo = (revealed: boolean) => {
    const targetOffset = revealed ? -actionsWidth() : 0;
    currentOffset = targetOffset;
    setTransform(targetOffset, true);

    if (revealed) {
      props.onRevealChange(props.itemId);
    } else if (props.revealedItemId() === props.itemId) {
      props.onRevealChange(null);
    }
  };

  // Handle context changes (close when another item is revealed)
  createEffect(() => {
    const revealed = props.revealedItemId();
    if (revealed !== props.itemId && currentOffset !== 0) {
      currentOffset = 0;
      setTransform(0, true);
    }
  });

  const handleTouchStart = (e: TouchEvent) => {
    if (props.disabled) return;

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isHorizontalSwipe = null;
    isDragging = false;

    // Start from current position (revealed or closed)
    currentOffset = isRevealed() ? -actionsWidth() : 0;

    // Disable transition for immediate response
    if (contentRef) {
      contentRef.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (props.disabled) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // Determine swipe direction if not yet locked
    if (isHorizontalSwipe === null) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX > DIRECTION_LOCK_THRESHOLD || absY > DIRECTION_LOCK_THRESHOLD) {
        isHorizontalSwipe = absX > absY;
      }
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe !== true) return;

    // Prevent vertical scrolling while swiping horizontally
    e.preventDefault();
    isDragging = true;

    // Calculate new offset based on starting position
    const startOffset = isRevealed() ? -actionsWidth() : 0;
    let newOffset = startOffset + deltaX;

    // Apply edge resistance
    if (newOffset > 0) {
      // Pulling right past closed position
      newOffset = newOffset * EDGE_RESISTANCE;
    } else if (newOffset < -actionsWidth()) {
      // Pulling left past fully revealed position
      const overPull = newOffset + actionsWidth();
      newOffset = -actionsWidth() + overPull * EDGE_RESISTANCE;
    }

    currentOffset = newOffset;
    setTransform(newOffset);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (props.disabled || !isDragging) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaTime = Date.now() - touchStartTime;
    const velocity = Math.abs(deltaX) / deltaTime;

    // Determine if we should reveal or close
    let shouldReveal: boolean;

    if (velocity > VELOCITY_THRESHOLD) {
      // Fast swipe - direction determines outcome
      shouldReveal = deltaX < 0;
    } else {
      // Slow drag - position determines outcome
      const threshold = actionsWidth() / 2;
      shouldReveal = currentOffset < -threshold;
    }

    snapTo(shouldReveal);
    isDragging = false;
    isHorizontalSwipe = null;
  };

  // Handle clicks on the content area to close revealed actions
  const handleContentClick = (e: MouseEvent) => {
    if (isRevealed()) {
      e.preventDefault();
      e.stopPropagation();
      snapTo(false);
    }
  };

  // Set up touch listeners
  onMount(() => {
    if (!containerRef) return;

    containerRef.addEventListener('touchstart', handleTouchStart, { passive: true });
    containerRef.addEventListener('touchmove', handleTouchMove, { passive: false });
    containerRef.addEventListener('touchend', handleTouchEnd, { passive: true });

    onCleanup(() => {
      if (!containerRef) return;
      containerRef.removeEventListener('touchstart', handleTouchStart);
      containerRef.removeEventListener('touchmove', handleTouchMove);
      containerRef.removeEventListener('touchend', handleTouchEnd);
    });
  });

  return (
    <div
      ref={containerRef}
      class="relative w-full overflow-hidden"
      style={{ 'touch-action': 'pan-y' }}
    >
      {/* Actions container - positioned behind content on the right */}
      <div
        class="absolute top-0 right-0 bottom-0 flex items-center justify-end"
        style={{ width: `${actionsWidth()}px` }}
      >
        {props.actions}
      </div>

      {/* Main content - slides left to reveal actions */}
      <div ref={contentRef} class="relative w-full bg-white" onClick={handleContentClick}>
        {props.children}
      </div>
    </div>
  );
}
