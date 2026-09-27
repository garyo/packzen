import { sourceId } from './api';
import { getSessionToken } from './clerk';

export interface SyncChange {
  entityType: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  parentId: string | null;
  data: any;
}

export type SyncHandler = (change: SyncChange) => void;

const BASE_POLL_INTERVAL = 3000;
const MAX_POLL_INTERVAL = 30000;
/** Rows per poll; must match the LIMIT in src/pages/api/sync/events.ts. */
const SYNC_PAGE_SIZE = 50;

/**
 * External calls the manager needs, factored out so tests can inject fakes
 * (a mock fetch, a controllable clock) without touching real network/timer
 * globals. Production code uses the defaults below.
 */
export interface SyncManagerDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  getToken: () => Promise<string | null>;
  setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
}

const defaultDeps: SyncManagerDeps = {
  fetch: (input, init) => fetch(input, init),
  getToken: getSessionToken,
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export class SyncManager {
  private deps: SyncManagerDeps;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<SyncHandler>>();
  /** Last id the server sent (0 = empty log); null until the first checkpoint arrives. */
  private lastEventId: number | null = null;
  private consecutiveErrors = 0;
  private active = false;
  /** Bumped on every connect(); poll loops capture it and refuse to outlive a reconnect. */
  private generation = 0;
  private onOnline: (() => void) | null = null;
  private onVisibilityChange: (() => void) | null = null;
  private resolveReady!: () => void;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor(deps: Partial<SyncManagerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * Resolves once the first poll has finished, successfully or not. Await it
   * before fetching a snapshot: after a successful poll the sync checkpoint is
   * established, so no change can fall between the snapshot and the
   * checkpoint. A failed first poll establishes none, so a change made before
   * the next successful poll can be missed until the page next refreshes; it
   * still resolves so a failing network doesn't hold up the page.
   */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  connect() {
    if (this.active) return;
    this.active = true;
    this.consecutiveErrors = 0;
    const generation = ++this.generation;
    this.addLifecycleListeners();
    this.poll(generation);
  }

  disconnect() {
    this.active = false;
    this.clearTimer();
    this.removeLifecycleListeners();
  }

  private addLifecycleListeners() {
    this.onOnline = () => this.resume();
    this.onVisibilityChange = () => {
      if (isHidden()) this.clearTimer();
      else this.resume();
    };
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private removeLifecycleListeners() {
    if (this.onOnline) {
      window.removeEventListener('online', this.onOnline);
      this.onOnline = null;
    }
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
  }

  private clearTimer() {
    if (this.timerId) {
      this.deps.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** Poll right away instead of waiting out the current backoff timer. */
  private resume() {
    if (!this.active) return;
    this.clearTimer();
    // Bump the generation so any poll already in flight (which cannot see
    // timerId to cancel) bails at the pre-reschedule guard instead of
    // surviving alongside this new poll loop.
    const generation = ++this.generation;
    this.poll(generation);
  }

  private async poll(generation: number) {
    if (!this.active || generation !== this.generation) return;

    let rowCount = 0;
    try {
      const token = await this.deps.getToken();
      const url = `/api/sync/events?sourceId=${sourceId}`;

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (this.lastEventId !== null) headers['Last-Event-ID'] = String(this.lastEventId);

      const res = await this.deps.fetch(url, { headers, credentials: 'same-origin' });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      this.consecutiveErrors = 0;
      const text = await res.text();
      rowCount = this.processEvents(text);
      // A checkpoint reply with no id means the change log is empty.
      this.lastEventId ??= 0;
    } catch {
      this.consecutiveErrors++;
    }
    this.resolveReady();

    // A disconnect (or disconnect+reconnect) that happened while the request
    // was in flight must not resurrect this loop or run alongside a newer one.
    // Hidden tabs stop polling until they become visible again.
    if (!this.active || generation !== this.generation || isHidden()) return;

    const interval =
      this.consecutiveErrors > 0
        ? Math.min(BASE_POLL_INTERVAL * 2 ** this.consecutiveErrors, MAX_POLL_INTERVAL)
        : rowCount >= SYNC_PAGE_SIZE
          ? 0 // A full page means more rows are waiting.
          : BASE_POLL_INTERVAL;

    this.timerId = this.deps.setTimeout(() => this.poll(generation), interval);
  }

  /** Apply an SSE body; returns how many change-log rows (ids) it carried. */
  private processEvents(text: string): number {
    let rowCount = 0;
    // Parse SSE format: blocks separated by double newlines
    const blocks = text.split('\n\n');
    for (const block of blocks) {
      let id: string | undefined;
      let data: string | undefined;
      let event: string | undefined;

      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) id = line.slice(4);
        else if (line.startsWith('data: ')) data = line.slice(6);
        else if (line.startsWith('event: ')) event = line.slice(7);
      }

      if (id !== undefined) {
        this.lastEventId = parseInt(id, 10);
        rowCount++;
      }

      if (event === 'sync' && data) {
        try {
          const change: SyncChange = JSON.parse(data);
          const handlers = this.handlers.get(change.entityType);
          handlers?.forEach((h) => h(change));
        } catch {
          // Malformed event — ignore
        }
      }
    }
    return rowCount;
  }

  /**
   * Subscribe to sync events for a given entity type.
   * Returns an unsubscribe function.
   */
  on(entityType: string, handler: SyncHandler): () => void {
    let set = this.handlers.get(entityType);
    if (!set) {
      set = new Set();
      this.handlers.set(entityType, set);
    }
    set.add(handler);

    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.handlers.delete(entityType);
      }
    };
  }
}

function isHidden(): boolean {
  return document.visibilityState === 'hidden';
}

export const syncManager = new SyncManager();

// Remote changes often arrive in bursts (an import on another device sends
// one event per row); collapse each burst into a single refetch.
const SYNC_REFETCH_DELAY_MS = 250;

/** Wrap a refetch so a burst of sync events triggers it once. */
export function coalesced(fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, SYNC_REFETCH_DELAY_MS);
  };
}
