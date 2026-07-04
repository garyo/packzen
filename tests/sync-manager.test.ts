import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncManager } from '../src/lib/sync-manager';

// sync-manager.ts references `window` / `document` only inside methods (not
// at module load time), so we can stub them as plain globals before calling
// connect(). It also reaches out to `fetch`, `getSessionToken` (via ./clerk),
// and the timer functions; those are covered by the injectable `deps` seam
// added to `SyncManager` (see src/lib/sync-manager.ts) so tests never touch
// real network/timer/Clerk globals for those.
//
// A minimal fake `window`/`document` (add/removeEventListener that just
// record handlers) is enough to exercise the online/visibilitychange
// reconnect paths without a DOM.

function makeFakeEventTarget() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  return {
    addEventListener(type: string, handler: (...args: any[]) => void) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener(type: string, handler: (...args: any[]) => void) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type: string, ...args: any[]) {
      for (const handler of listeners.get(type) ?? []) handler(...args);
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function okResponse(body = '') {
  return { ok: true, status: 200, text: async () => body } as Response;
}

function errResponse(status = 500) {
  return { ok: false, status, text: async () => '' } as Response;
}

/** A cooperative fake clock: setTimeout just records {fn, ms}; tick() runs due callbacks. */
function makeFakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; due: number }>();

  return {
    setTimeout(fn: () => void, ms: number) {
      const id = nextId++;
      pending.set(id, { fn, due: now + ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(id: ReturnType<typeof setTimeout>) {
      pending.delete(id as unknown as number);
    },
    /** Advance time and synchronously run any timers that are now due (single pass). */
    async tick(ms: number) {
      now += ms;
      const due = [...pending.entries()].filter(([, t]) => t.due <= now);
      for (const [id] of due) pending.delete(id);
      for (const [, t] of due) t.fn();
      // let any microtasks/async poll bodies triggered by the timer settle
      await Promise.resolve();
      await Promise.resolve();
    },
    pendingDelays() {
      return [...pending.values()].map((t) => t.due - now);
    },
    pendingCount() {
      return pending.size;
    },
  };
}

test('sync-manager: backoff grows on repeated failure and resets on success', async () => {
  const fakeWindow = makeFakeEventTarget();
  const fakeDocument = { ...makeFakeEventTarget(), visibilityState: 'visible' };
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;

  const clock = makeFakeClock();
  let fetchImpl = async () => errResponse();

  const manager = new SyncManager({
    fetch: () => fetchImpl(),
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect();
  await Promise.resolve();
  await Promise.resolve();

  // First poll fails immediately (before any tick) -> scheduled retry should
  // reflect 1 consecutive error.
  assert.deepEqual(clock.pendingDelays(), [3000 * 2 ** 1]);

  // Let it fail two more times, growing the backoff each time.
  await clock.tick(clock.pendingDelays()[0]);
  assert.deepEqual(clock.pendingDelays(), [3000 * 2 ** 2]);

  await clock.tick(clock.pendingDelays()[0]);
  assert.deepEqual(clock.pendingDelays(), [3000 * 2 ** 3]);

  // Cap: keep failing until we'd exceed the max interval.
  await clock.tick(clock.pendingDelays()[0]);
  await clock.tick(clock.pendingDelays()[0]);
  assert.equal(clock.pendingDelays()[0], 30000, 'interval caps at 30s');

  // Now succeed -> backoff should reset to the base interval.
  fetchImpl = async () => okResponse();
  await clock.tick(clock.pendingDelays()[0]);
  assert.deepEqual(clock.pendingDelays(), [3000], 'resets to base interval on success');

  manager.disconnect();
});

test('sync-manager: polling resumes past the old permanent-disconnect threshold (5 errors)', async () => {
  (globalThis as any).window = makeFakeEventTarget();
  (globalThis as any).document = { ...makeFakeEventTarget(), visibilityState: 'visible' };

  const clock = makeFakeClock();
  const manager = new SyncManager({
    fetch: async () => errResponse(),
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect();
  await Promise.resolve();
  await Promise.resolve();

  // Drive through more than 5 consecutive failures (the old MAX_CONSECUTIVE_ERRORS).
  for (let i = 0; i < 8; i++) {
    assert.equal(clock.pendingCount(), 1, `still scheduled after ${i} failures`);
    await clock.tick(clock.pendingDelays()[0]);
  }

  // Still scheduled — never permanently disconnected.
  assert.equal(clock.pendingCount(), 1, 'a retry is still scheduled well past 5 failures');

  manager.disconnect();
});

test('sync-manager: online event triggers an immediate reconnect/poll', async () => {
  const fakeWindow = makeFakeEventTarget();
  const fakeDocument = { ...makeFakeEventTarget(), visibilityState: 'visible' };
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;

  const clock = makeFakeClock();
  let fetchCalls = 0;
  const manager = new SyncManager({
    fetch: async () => {
      fetchCalls++;
      return errResponse();
    },
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
  assert.equal(fakeWindow.listenerCount('online'), 1, 'connect() registers an online listener');

  // Backoff timer is pending (long delay); firing 'online' should poll right
  // away rather than waiting for it.
  const pendingBefore = clock.pendingCount();
  assert.equal(pendingBefore, 1);

  fakeWindow.dispatch('online');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchCalls, 2, 'online event caused an immediate extra poll');

  manager.disconnect();
  assert.equal(fakeWindow.listenerCount('online'), 0, 'disconnect() removes the online listener');
});

test('sync-manager: visibilitychange (visible) triggers an immediate reconnect/poll', async () => {
  const fakeWindow = makeFakeEventTarget();
  const fakeDocument = { ...makeFakeEventTarget(), visibilityState: 'hidden' };
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;

  const clock = makeFakeClock();
  let fetchCalls = 0;
  const manager = new SyncManager({
    fetch: async () => {
      fetchCalls++;
      return errResponse();
    },
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);

  // Tab hidden -> visibilitychange fires but should NOT trigger a poll.
  fakeDocument.dispatch('visibilitychange');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls, 1, 'no extra poll while hidden');

  // Tab becomes visible -> should poll immediately.
  fakeDocument.visibilityState = 'visible';
  fakeDocument.dispatch('visibilitychange');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCalls, 2, 'visible triggers an immediate poll');

  manager.disconnect();
  assert.equal(
    fakeDocument.listenerCount('visibilitychange'),
    0,
    'disconnect() removes the visibilitychange listener'
  );
});

test('sync-manager: a poll from a superseded generation does not reschedule after disconnect+reconnect', async () => {
  (globalThis as any).window = makeFakeEventTarget();
  (globalThis as any).document = { ...makeFakeEventTarget(), visibilityState: 'visible' };

  const clock = makeFakeClock();

  // The first fetch call resolves only when we release it manually, so we
  // can disconnect+reconnect while it's "in flight" and observe what the
  // old-generation poll does when it finally completes.
  let releaseFirstFetch!: (r: Response) => void;
  const firstFetchPromise = new Promise<Response>((resolve) => {
    releaseFirstFetch = resolve;
  });
  let fetchCallCount = 0;
  const manager = new SyncManager({
    fetch: async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) return firstFetchPromise;
      return errResponse();
    },
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect(); // generation 1, poll #1 in flight (blocked on firstFetchPromise)
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCallCount, 1);

  // Simulate the S5 race: disconnect while the request is in flight, then
  // reconnect immediately (generation bumps to 2, a fresh poll loop starts).
  manager.disconnect();
  manager.connect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCallCount, 2, 'reconnect started a new poll (generation 2)');
  assert.equal(clock.pendingCount(), 1, 'exactly one loop scheduled after reconnect');

  // Now let the stale generation-1 fetch resolve. Its poll() must see that
  // `generation !== this.generation` and refuse to reschedule — otherwise a
  // second, duplicate loop would appear alongside generation 2's.
  releaseFirstFetch(errResponse());
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    clock.pendingCount(),
    1,
    'stale generation poll did not spawn a duplicate scheduled loop'
  );

  manager.disconnect();
});

test('sync-manager: online event while a poll is in flight does not spawn a duplicate loop', async () => {
  const fakeWindow = makeFakeEventTarget();
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = { ...makeFakeEventTarget(), visibilityState: 'visible' };

  const clock = makeFakeClock();

  // The first fetch call resolves only when we release it manually, so we
  // can fire 'online' while it's still in flight — the exact S5-reintroduction
  // race: resume() must not start a second concurrent poll of the same
  // generation, since timerId is null while a fetch is awaited and so
  // resume()'s own "clear the timer" guard can't catch it.
  let releaseFirstFetch!: (r: Response) => void;
  const firstFetchPromise = new Promise<Response>((resolve) => {
    releaseFirstFetch = resolve;
  });
  let fetchCallCount = 0;
  const manager = new SyncManager({
    fetch: async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) return firstFetchPromise;
      return errResponse();
    },
    getToken: async () => null,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });

  manager.connect(); // generation 1, poll #1 in flight (blocked on firstFetchPromise)
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCallCount, 1);
  assert.equal(clock.pendingCount(), 0, 'no timer yet — poll #1 is still awaiting its fetch');

  // Connectivity flaps while poll #1 is still awaiting its fetch.
  fakeWindow.dispatch('online');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchCallCount, 2, 'online triggered an immediate second poll (generation 2)');
  assert.equal(
    clock.pendingCount(),
    1,
    'exactly one loop scheduled after the online-triggered poll'
  );

  // Now let the original (generation-1) fetch resolve. Its poll() must see
  // `generation !== this.generation` and refuse to reschedule — otherwise a
  // second, duplicate loop would run alongside generation 2's.
  releaseFirstFetch(errResponse());
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(
    clock.pendingCount(),
    1,
    'superseded in-flight poll did not spawn a duplicate scheduled loop'
  );

  manager.disconnect();
});
