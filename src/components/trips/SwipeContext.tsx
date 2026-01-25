/**
 * SwipeContext - Manages which item has its actions revealed
 *
 * Ensures only one item is revealed at a time across the list.
 * When a new item is swiped open, the previous one closes automatically.
 */

import { createContext, createSignal, useContext, type JSX, type Accessor } from 'solid-js';

interface SwipeContextValue {
  revealedItemId: Accessor<string | null>;
  setRevealedItemId: (id: string | null) => void;
  closeAll: () => void;
}

const SwipeContext = createContext<SwipeContextValue>();

export function SwipeProvider(props: { children: JSX.Element }) {
  const [revealedItemId, setRevealedItemId] = createSignal<string | null>(null);

  const closeAll = () => setRevealedItemId(null);

  return (
    <SwipeContext.Provider value={{ revealedItemId, setRevealedItemId, closeAll }}>
      {props.children}
    </SwipeContext.Provider>
  );
}

export function useSwipeContext() {
  const context = useContext(SwipeContext);
  if (!context) {
    throw new Error('useSwipeContext must be used within a SwipeProvider');
  }
  return context;
}

// Optional hook that returns undefined if not in a SwipeProvider
// (useful for components that can work with or without swipe support)
export function useMaybeSwipeContext() {
  return useContext(SwipeContext);
}
