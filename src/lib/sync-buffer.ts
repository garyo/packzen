// Coordinates incremental remote sync events against wholesale snapshot
// reloads (a full fetch-and-replace of a store's array from the server).
//
// The bug this fixes: a snapshot fetch is a point-in-time read. If a remote
// sync event for the same entity arrives while that fetch is in flight, the
// event describes something the snapshot doesn't know about yet. Applying
// the event immediately is safe, but applying it and then letting the
// snapshot land afterward silently clobbers it - and since the poller's
// cursor has already moved past that event, it's never redelivered. The
// loss is permanent until a full reload.
//
// LoadGate closes that window: while a load is in flight, submit() queues
// events instead of applying them; endLoad() (called once the snapshot has
// been written to the store) replays the queue in order on top of it.
export class LoadGate<TEvent> {
  private activeLoads = 0;
  private queue: TEvent[] = [];

  isLoading(): boolean {
    return this.activeLoads > 0;
  }

  // Call before starting a snapshot fetch. Loads may overlap (e.g. a
  // post-mutation refetch racing a visibility-change silent refresh); the
  // gate only re-opens once every in-flight load has ended.
  startLoad(): void {
    this.activeLoads++;
  }

  // Call once the snapshot has been written to the store. Drains and
  // replays any events queued while this (and any overlapping) load was in
  // flight, in the order they arrived. `apply` should be the same function
  // that submit() would otherwise have called directly - replaying an event
  // the snapshot already reflects must be a harmless no-op, which is a
  // property of the apply function, not of this gate.
  endLoad(apply: (event: TEvent) => void): void {
    this.activeLoads = Math.max(0, this.activeLoads - 1);
    if (this.activeLoads > 0) return;

    const queued = this.queue;
    this.queue = [];
    queued.forEach(apply);
  }

  // Submit an event: applied immediately when no load is in flight, queued
  // otherwise. Returns whether it was queued, so callers that only need the
  // side effect can ignore the return value.
  submit(event: TEvent, apply: (event: TEvent) => void): boolean {
    if (this.isLoading()) {
      this.queue.push(event);
      return true;
    }
    apply(event);
    return false;
  }
}
