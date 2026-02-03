import { sourceId } from './api';

export interface SyncChange {
  entityType: string;
  action: 'create' | 'update' | 'delete';
  entityId: string;
  parentId: string | null;
  data: any;
}

export type SyncHandler = (change: SyncChange) => void;

class SyncManager {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<SyncHandler>>();

  connect() {
    if (this.es) return;
    this.es = new EventSource(`/api/sync/events?sourceId=${sourceId}`);

    this.es.addEventListener('sync', (e: MessageEvent) => {
      try {
        const change: SyncChange = JSON.parse(e.data);
        const handlers = this.handlers.get(change.entityType);
        handlers?.forEach((h) => h(change));
      } catch {
        // Malformed event — ignore
      }
    });

    this.es.addEventListener('error', () => {
      // EventSource auto-reconnects; nothing extra needed
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
