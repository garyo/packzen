/**
 * The packing page's trip items: loading, live sync, and every write, with
 * optimistic updates, per-item rollback and Undo.
 *
 * Call `createTripItemsStore` during component setup: it registers its sync
 * subscriptions and initial load in an `onMount`.
 */
import { createMemo, onCleanup, onMount } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { api, endpoints } from './api';
import type { TripItem } from './types';
import { authStore } from '../stores/auth';
import { syncManager, type SyncChange } from './sync-manager';
import { LoadGate } from './sync-buffer';
import { exclusivePackState, packingStats } from './packing-stats';
import { showToast } from '../components/ui/Toast';

type ItemPatch = Partial<TripItem>;

/** A row for the batch-create endpoint. */
export type NewItemRow = Pick<TripItem, 'name'> &
  Partial<
    Pick<
      TripItem,
      | 'category_name'
      | 'quantity'
      | 'notes'
      | 'bag_id'
      | 'container_item_id'
      | 'master_item_id'
      | 'is_container'
      | 'is_packed'
      | 'is_skipped'
    >
  >;

export interface MutationOptions {
  /** Toast text, or a function of how many items the change applied to. */
  label: string | ((count: number) => string);
  /** Offer Undo on the success toast (default true). */
  undo?: boolean;
  /** Skip the success toast; failures are still reported. */
  quiet?: boolean;
}

const REFRESH_DEBOUNCE_MS = 5000;
const SYNC_READY_TIMEOUT_MS = 3000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isFullRow = (data: unknown): data is TripItem =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as TripItem).id === 'string' &&
  typeof (data as TripItem).name === 'string' &&
  'trip_id' in data;

function pick(item: TripItem, keys: (keyof TripItem)[]): ItemPatch {
  return Object.fromEntries(keys.map((key) => [key, item[key]]));
}

export function createTripItemsStore(tripId: string) {
  const [state, setState] = createStore({
    data: [] as TripItem[],
    loading: true,
    error: null as string | null,
  });

  const items = () => (state.loading ? undefined : state.data);
  const find = (id: string) => state.data.find((item) => item.id === id);

  // Every write to the store bumps `epoch`, and `pendingWrites` counts server
  // writes in flight. A background refresh whose request overlapped either is
  // stale — it could undo an optimistic tap — so it's dropped and re-read.
  let epoch = 0;
  let pendingWrites = 0;
  let refreshWanted = false;

  function update(ids: string[], patch: ItemPatch) {
    epoch++;
    const idSet = new Set(ids);
    setState(
      'data',
      (item) => idSet.has(item.id),
      produce((item) => Object.assign(item, patch))
    );
  }

  /** Upsert by id: the server may answer a create with an existing, merged row. */
  function upsert(rows: TripItem[]) {
    epoch++;
    setState(
      produce((s) => {
        for (const row of rows) {
          const index = s.data.findIndex((item) => item.id === row.id);
          if (index === -1) s.data.push(row);
          else s.data[index] = row;
        }
      })
    );
  }

  /** The given ids plus the contents of any containers among them. */
  function withContents(ids: string[]): Set<string> {
    const idSet = new Set(ids);
    for (const item of state.data) {
      if (item.container_item_id && idSet.has(item.container_item_id)) idSet.add(item.id);
    }
    return idSet;
  }

  /** Remove items (and the contents of removed containers); returns plain copies of them. */
  function remove(ids: string[]): TripItem[] {
    epoch++;
    const doomed = withContents(ids);
    const removed = state.data.filter((item) => doomed.has(item.id)).map((item) => ({ ...item }));
    setState('data', (data) => data.filter((item) => !doomed.has(item.id)));
    return removed;
  }

  async function tracked<T>(write: () => Promise<T>): Promise<T> {
    pendingWrites++;
    try {
      return await write();
    } finally {
      pendingWrites--;
      epoch++;
      if (pendingWrites === 0 && refreshWanted) {
        refreshWanted = false;
        void refresh(true);
      }
    }
  }

  // Sync events replay through here after a load (see LoadGate), so every
  // branch must be idempotent.
  function applyRemoteChange(change: SyncChange) {
    if (change.action === 'delete') remove([change.entityId]);
    else if (find(change.entityId)) update([change.entityId], change.data);
    else if (isFullRow(change.data)) upsert([change.data]);
  }

  // Queues sync events while a snapshot load is in flight, so the snapshot
  // can't clobber them when it lands (see src/lib/sync-buffer.ts).
  const loadGate = new LoadGate<SyncChange>();
  let lastFetchTime = 0;

  /** Load with a visible loading state (initial load and Retry). */
  async function load() {
    setState({ loading: true, error: null });
    loadGate.startLoad();
    const response = await api.get<TripItem[]>(endpoints.tripItems(tripId));
    if (response.success) {
      setState({ data: response.data ?? [], loading: false });
      lastFetchTime = Date.now();
    } else {
      if (response.statusCode !== 401) {
        showToast('error', response.error || 'Failed to load trip items');
      }
      setState({ loading: false, error: response.error || 'Failed to load items' });
    }
    loadGate.endLoad(applyRemoteChange);
  }

  /**
   * Re-read items in the background and diff them into the store. Skipped
   * within the debounce window of the last read unless `force`.
   */
  async function refresh(force = false) {
    if (state.loading) return;
    if (!force && Date.now() - lastFetchTime < REFRESH_DEBOUNCE_MS) return;
    lastFetchTime = Date.now();

    const startEpoch = epoch;
    const startedClean = pendingWrites === 0;
    loadGate.startLoad();
    const response = await api.get<TripItem[]>(endpoints.tripItems(tripId));
    const stale = !startedClean || pendingWrites > 0 || epoch !== startEpoch;
    if (response.success && !stale) {
      setState('data', reconcile(response.data ?? []));
    }
    loadGate.endLoad(applyRemoteChange);

    if (response.success && stale) {
      if (pendingWrites > 0) refreshWanted = true;
      else void refresh(true);
    }
  }

  const patchRequest = (id: string, patch: ItemPatch) =>
    api.patch<TripItem>(endpoints.tripItems(tripId), { id, ...patch });
  const deleteRequest = (id: string) =>
    api.delete(endpoints.tripItems(tripId), { body: JSON.stringify({ id }) });

  /** Apply per-item patches optimistically and send them; failures roll back to `before`. */
  function writePatches(after: Map<string, ItemPatch>, before: Map<string, ItemPatch>) {
    return tracked(async () => {
      const ids = [...after.keys()];
      for (const id of ids) update([id], after.get(id)!);
      const responses = await Promise.all(ids.map((id) => patchRequest(id, after.get(id)!)));
      const failed = ids.filter((_, i) => !responses[i].success);
      for (const id of failed) update([id], before.get(id)!);
      return { failed, error: responses.find((r) => !r.success)?.error };
    });
  }

  function announce(
    succeeded: number,
    failed: number,
    error: string | undefined,
    options: MutationOptions,
    undo: () => Promise<void>
  ) {
    const { label } = options;
    const describe = typeof label === 'string' ? () => label : label;
    if (failed > 0) {
      showToast(
        'error',
        succeeded > 0
          ? `${describe(succeeded)}; ${failed} failed`
          : error || "Couldn't save your change"
      );
    } else if (succeeded > 0 && !options.quiet) {
      showToast(
        'info',
        describe(succeeded),
        options.undo === false
          ? undefined
          : { action: { label: 'Undo', onClick: () => void undo() } }
      );
    }
  }

  /**
   * Set the same fields on several items: optimistic, rolled back per item on
   * failure, and undoable. Packed and skipped are kept mutually exclusive.
   */
  async function patchItems(ids: string[], patch: ItemPatch, options: MutationOptions) {
    const next = exclusivePackState(patch);
    const keys = Object.keys(next) as (keyof TripItem)[];
    const targets = ids.map(find).filter((item): item is TripItem => !!item);
    if (targets.length === 0) return;

    const before = new Map(targets.map((item) => [item.id, pick(item, keys)]));
    const after = new Map(targets.map((item) => [item.id, next]));
    const { failed, error } = await writePatches(after, before);
    const succeeded = [...after.keys()].filter((id) => !failed.includes(id));

    announce(succeeded.length, failed.length, error, options, async () => {
      const undone = await writePatches(
        new Map(succeeded.map((id) => [id, before.get(id)!])),
        new Map(succeeded.map((id) => [id, next]))
      );
      if (undone.failed.length > 0) showToast('error', 'Failed to undo');
    });
  }

  /** Quietly set different fields on each item (no toast or Undo); failures roll back. */
  async function patchEach(patches: Map<string, ItemPatch>) {
    const known = [...patches].filter(([id]) => find(id));
    if (known.length === 0) return;
    const before = known.map(([id, patch]): [string, ItemPatch] => [
      id,
      pick(find(id)!, Object.keys(patch) as (keyof TripItem)[]),
    ]);
    await writePatches(new Map(known), new Map(before));
  }

  /** POST rows in one batch; the server skips names already on the trip. Null on failure. */
  function addItems(rows: NewItemRow[]): Promise<TripItem[] | null> {
    if (rows.length === 0) return Promise.resolve([]);
    return tracked(async () => {
      const response = await api.post<TripItem[]>(endpoints.tripItems(tripId), { items: rows });
      if (!response.success) {
        showToast('error', response.error || 'Failed to add items');
        return null;
      }
      const inserted = response.data ?? [];
      upsert(inserted);
      return inserted;
    });
  }

  /** Undo a delete by re-creating the rows: containers first, so contents can point at them. */
  async function restoreItems(removed: TripItem[]) {
    const toRow = (item: TripItem, containerId: string | null): NewItemRow => ({
      name: item.name,
      category_name: item.category_name,
      quantity: item.quantity,
      notes: item.notes,
      bag_id: containerId ? null : item.bag_id,
      container_item_id: containerId,
      master_item_id: item.master_item_id,
      is_container: item.is_container,
      is_packed: item.is_packed,
      is_skipped: item.is_skipped,
    });

    const containers = removed.filter((item) => item.is_container);
    const newContainerIds = new Map<string, string>();
    const createdContainers = await addItems(containers.map((c) => toRow(c, null)));
    if (!createdContainers) return;
    for (const container of containers) {
      const created = createdContainers.find(
        (row) => row.name.toLowerCase() === container.name.toLowerCase()
      );
      if (created) newContainerIds.set(container.id, created.id);
    }

    const resolveContainer = (id: string | null) =>
      id ? (newContainerIds.get(id) ?? (find(id) ? id : null)) : null;
    await addItems(
      removed
        .filter((item) => !item.is_container)
        .map((item) => toRow(item, resolveContainer(item.container_item_id)))
    );
  }

  /** Delete items (a container takes its contents with it), with rollback and Undo. */
  async function deleteItems(ids: string[], options: MutationOptions) {
    const requested = new Set(ids);
    // The server cascades a container's contents, so only send the top-level deletes.
    const roots = ids.filter((id) => {
      const item = find(id);
      return item && !(item.container_item_id && requested.has(item.container_item_id));
    });
    if (roots.length === 0) return;

    const { removed, failed, error } = await tracked(async () => {
      const removed = remove(roots);
      const responses = await Promise.all(roots.map(deleteRequest));
      const failed = new Set(roots.filter((_, i) => !responses[i].success));
      const kept = removed.filter(
        (item) =>
          failed.has(item.id) || (item.container_item_id && failed.has(item.container_item_id))
      );
      upsert(kept);
      return {
        removed: removed.filter((item) => !kept.includes(item)),
        failed,
        error: responses.find((r) => !r.success)?.error,
      };
    });

    announce(roots.length - failed.size, failed.size, error, options, () => restoreItems(removed));
  }

  onMount(() => {
    // Everything that registers an onCleanup runs before the first await: an
    // onCleanup after an await has no owner and would never run.
    syncManager.connect();
    onCleanup(() => syncManager.disconnect());
    onCleanup(
      syncManager.on('tripItem', (change) => {
        if (change.parentId === tripId) loadGate.submit(change, applyRemoteChange);
      })
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    onCleanup(() => document.removeEventListener('visibilitychange', onVisible));

    void (async () => {
      await authStore.initAuth();
      // Load after the poller's checkpoint, so every later change arrives as an event.
      await Promise.race([syncManager.ready(), delay(SYNC_READY_TIMEOUT_MS)]);
      await load();
    })();
  });

  // Both list views hide items whose container no longer exists, so they
  // aren't counted either.
  const renderableItems = createMemo(() => {
    const all = items() ?? [];
    const containerIds = new Set(all.filter((i) => i.is_container).map((i) => i.id));
    return all.filter((i) => !i.container_item_id || containerIds.has(i.container_item_id));
  });
  const stats = createMemo(() => packingStats(renderableItems()));

  return {
    state,
    items,
    renderableItems,
    stats,
    find,
    load,
    refresh,
    /** Reflect writes another component already made on the server. */
    local: { update, upsert, remove },
    patchItems,
    patchEach,
    deleteItems,
    addItems,
  };
}

export type TripItemsStore = ReturnType<typeof createTripItemsStore>;
