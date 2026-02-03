import { sourceId } from './api';

export interface SyncChange {
  entityType: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  parentId: string | null;
  data: any;
}

export type SyncHandler = (change: SyncChange) => void;

// After this many consecutive connection failures (without any successful
// open), stop polling. This prevents a 401 loop if the session expires.
const MAX_CONSECUTIVE_ERRORS = 5;

class SyncManager {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<SyncHandler>>();
  private consecutiveFailures = 0;

  connect() {
    if (this.es) return;
    this.consecutiveFailures = 0;
    this.es = new EventSource(`/api/sync/events?sourceId=${sourceId}`);

    // 'open' fires each time EventSource successfully connects (including
    // auto-reconnects). Reset the failure counter on success.
    this.es.addEventListener('open', () => {
      this.consecutiveFailures = 0;
    });

    this.es.addEventListener('sync', (e: MessageEvent) => {
      try {
        const change: SyncChange = JSON.parse(e.data);
        const handlers = this.handlers.get(change.entityType);
        handlers?.forEach((h) => h(change));
      } catch {
        // Malformed event — ignore
      }
    });

    // EventSource fires an error on every poll cycle close (expected for
    // this short-lived SSE pattern) AND on actual failures (401, network).
    // We count failures that occur without a preceding 'open', and stop
    // after MAX_CONSECUTIVE_ERRORS to avoid a 401 polling loop.
    this.es.addEventListener('error', () => {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_ERRORS) {
        this.disconnect();
      }
    });
  }

  disconnect() {
    this.es?.close();
    this.es = null;
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
