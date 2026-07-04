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
  private lastEventId = 0;
  private consecutiveErrors = 0;
  private active = false;
  /** Bumped on every connect(); poll loops capture it and refuse to outlive a reconnect. */
  private generation = 0;
  private onOnline: (() => void) | null = null;
  private onVisibilityChange: (() => void) | null = null;

  constructor(deps: Partial<SyncManagerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
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
    if (this.timerId) {
      this.deps.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.removeLifecycleListeners();
  }

  private addLifecycleListeners() {
    this.onOnline = () => this.resume();
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') this.resume();
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

  /** Poll right away instead of waiting out the current backoff timer. */
  private resume() {
    if (!this.active) return;
    if (this.timerId) {
      this.deps.clearTimeout(this.timerId);
      this.timerId = null;
    }
    // Bump the generation so any poll already in flight (which cannot see
    // timerId to cancel) bails at the pre-reschedule guard instead of
    // surviving alongside this new poll loop.
    const generation = ++this.generation;
    this.poll(generation);
  }

  private async poll(generation: number) {
    if (!this.active || generation !== this.generation) return;

    try {
      const token = await this.deps.getToken();
      const url = `/api/sync/events?sourceId=${sourceId}`;

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (this.lastEventId) headers['Last-Event-ID'] = String(this.lastEventId);

      const res = await this.deps.fetch(url, { headers, credentials: 'same-origin' });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      this.consecutiveErrors = 0;
      const text = await res.text();
      this.processEvents(text);
    } catch {
      this.consecutiveErrors++;
    }

    // A disconnect (or disconnect+reconnect) that happened while the request
    // was in flight must not resurrect this loop or run alongside a newer one.
    if (!this.active || generation !== this.generation) return;

    const interval =
      this.consecutiveErrors > 0
        ? Math.min(BASE_POLL_INTERVAL * 2 ** this.consecutiveErrors, MAX_POLL_INTERVAL)
        : BASE_POLL_INTERVAL;

    this.timerId = this.deps.setTimeout(() => this.poll(generation), interval);
  }

  private processEvents(text: string) {
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

      if (id) {
        this.lastEventId = parseInt(id, 10);
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

export const syncManager = new SyncManager();
