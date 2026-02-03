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

const POLL_INTERVAL = 3000;
const MAX_CONSECUTIVE_ERRORS = 5;

class SyncManager {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<SyncHandler>>();
  private lastEventId = 0;
  private consecutiveErrors = 0;
  private active = false;

  connect() {
    if (this.active) return;
    this.active = true;
    this.consecutiveErrors = 0;
    this.poll();
  }

  disconnect() {
    this.active = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private async poll() {
    if (!this.active) return;

    try {
      const token = await getSessionToken();
      const url = `/api/sync/events?sourceId=${sourceId}`;

      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (this.lastEventId) headers['Last-Event-ID'] = String(this.lastEventId);

      const res = await fetch(url, { headers, credentials: 'same-origin' });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      this.consecutiveErrors = 0;
      const text = await res.text();
      this.processEvents(text);
    } catch {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.disconnect();
        return;
      }
    }

    // Schedule next poll
    if (this.active) {
      this.timerId = setTimeout(() => this.poll(), POLL_INTERVAL);
    }
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
