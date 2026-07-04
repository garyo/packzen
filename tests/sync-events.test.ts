import test from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { changeLog } from '../db/schema';
import { GET } from '../src/pages/api/sync/events';
import { createTestDatabase, buildApiContext } from './test-helpers';

// ---------------------------------------------------------------------------
// Small helpers for driving the real GET /api/sync/events handler and
// decoding its SSE-ish text body, mirroring (a simplified version of) the
// parsing sync-manager.ts does on the client.
// ---------------------------------------------------------------------------

interface ParsedEvent {
  id: number;
  event?: string;
  data?: unknown;
}

function parseEvents(body: string): ParsedEvent[] {
  const results: ParsedEvent[] = [];
  for (const block of body.split('\n\n')) {
    if (!block.trim() || block.startsWith('retry:') || block.startsWith(':heartbeat')) continue;

    let id: number | undefined;
    let event: string | undefined;
    let dataLine: string | undefined;

    for (const line of block.split('\n')) {
      if (line.startsWith('id: ')) id = parseInt(line.slice(4), 10);
      else if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) dataLine = line.slice(6);
    }

    if (id === undefined) continue;
    results.push({ id, event, data: dataLine ? JSON.parse(dataLine) : undefined });
  }
  return results;
}

async function pollEvents(
  d1: Awaited<ReturnType<typeof createTestDatabase>>,
  userId: string,
  opts: { lastEventId?: number; sourceId?: string } = {}
) {
  const url = opts.sourceId
    ? `http://localhost/api/sync/events?sourceId=${opts.sourceId}`
    : 'http://localhost/api/sync/events';
  const headers: Record<string, string> = {};
  if (opts.lastEventId !== undefined) headers['Last-Event-ID'] = String(opts.lastEventId);

  const ctx = buildApiContext({
    db: d1,
    userId,
    request: new Request(url, { headers }),
  });
  const response = await GET!(ctx);
  const body = await response.text();
  return { status: response.status, body, events: parseEvents(body) };
}

/** Fresh-tab checkpoint request: no Last-Event-ID header at all. */
async function getCheckpoint(d1: Awaited<ReturnType<typeof createTestDatabase>>, userId: string) {
  const ctx = buildApiContext({
    db: d1,
    userId,
    request: new Request('http://localhost/api/sync/events'),
  });
  const response = await GET!(ctx);
  const body = await response.text();
  const parsed = parseEvents(body);
  return parsed.length > 0 ? parsed[0].id : 0;
}

async function insertChange(
  db: ReturnType<typeof drizzle>,
  opts: {
    userId: string;
    entityType: string;
    entityId: string;
    parentId?: string | null;
    action: string;
    data?: string | null;
    sourceId?: string | null;
  }
) {
  return db
    .insert(changeLog)
    .values({
      clerk_user_id: opts.userId,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      parent_id: opts.parentId ?? null,
      action: opts.action,
      data: opts.data ?? null,
      source_id: opts.sourceId ?? null,
      created_at: Math.floor(Date.now() / 1000),
    })
    .returning()
    .get();
}

// ---------------------------------------------------------------------------
// (a) S4 — a change committed between the checkpoint capture and the initial
// items fetch must still be delivered by a subsequent poll.
// ---------------------------------------------------------------------------

test('checkpoint semantics: a change committed after the checkpoint is captured is still delivered', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_checkpoint';

  // Some pre-existing history before the tab ever opens.
  await insertChange(db, {
    userId,
    entityType: 'trip',
    entityId: 'trip-1',
    action: 'create',
    data: JSON.stringify({ name: 'Existing Trip' }),
  });

  // Fresh tab opens: establish the checkpoint (no Last-Event-ID header).
  const checkpoint = await getCheckpoint(d1, userId);
  assert.ok(checkpoint > 0, 'checkpoint should reflect existing history');

  // A change lands on another device in the window between the checkpoint
  // being captured and the (simulated) initial items fetch completing.
  const raced = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-1',
    parentId: 'trip-1',
    action: 'create',
    data: JSON.stringify({ name: 'Passport' }),
  });

  // The next poll, resuming from the checkpoint, must still see it — proving
  // the server's `gt(id, lastEventId)` boundary doesn't drop anything that
  // lands after the checkpoint was taken.
  const { status, events } = await pollEvents(d1, userId, { lastEventId: checkpoint });
  assert.equal(status, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, raced.id);
  assert.deepEqual(events[0].data, {
    entityType: 'tripItem',
    action: 'create',
    entityId: 'item-1',
    parentId: 'trip-1',
    data: { name: 'Passport' },
  });
});

test('checkpoint semantics: history before the checkpoint is not replayed to a fresh tab', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_checkpoint_2';

  await insertChange(db, {
    userId,
    entityType: 'trip',
    entityId: 'trip-1',
    action: 'create',
    data: JSON.stringify({ name: 'Old Trip' }),
  });

  const ctx = buildApiContext({
    db: d1,
    userId,
    request: new Request('http://localhost/api/sync/events'),
  });
  const response = await GET!(ctx);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.ok(
    !body.includes('event: sync'),
    'fresh-tab checkpoint response should not replay history'
  );
});

// ---------------------------------------------------------------------------
// (b) S6 — a malformed change_log.data row must not 500 the whole poll, and
// the other (valid) rows in the same batch must still come back.
// ---------------------------------------------------------------------------

test('a malformed change_log row is skipped without 500ing the poll; other rows still return', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_malformed';

  const before = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-1',
    action: 'create',
    data: JSON.stringify({ name: 'Good Item 1' }),
  });
  const malformed = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-bad',
    action: 'update',
    data: '{not valid json', // simulates a corrupted row
  });
  const after = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-2',
    action: 'create',
    data: JSON.stringify({ name: 'Good Item 2' }),
  });

  const { status, events } = await pollEvents(d1, userId, { lastEventId: 0 });

  assert.equal(status, 200, 'malformed row must not crash the poll into a 500');

  const syncEvents = events.filter((e) => e.event === 'sync');
  assert.equal(syncEvents.length, 2, 'both valid rows should still be delivered');
  assert.deepEqual(
    syncEvents.map((e) => e.id),
    [before.id, after.id]
  );

  // The malformed row's id should still appear (bare, no `event: sync`) so
  // the client's checkpoint advances past it instead of re-fetching (and
  // re-failing on) it forever.
  const malformedEntry = events.find((e) => e.id === malformed.id);
  assert.ok(malformedEntry, 'malformed row id should still be present to advance the checkpoint');
  assert.equal(malformedEntry?.event, undefined);
});

test('a malformed row is the only change in the batch: poll still succeeds with no sync events', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_malformed_only';

  const malformed = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-bad',
    action: 'update',
    data: 'not even close to json {{{',
  });

  const { status, events } = await pollEvents(d1, userId, { lastEventId: 0 });

  assert.equal(status, 200);
  assert.equal(events.filter((e) => e.event === 'sync').length, 0);
  assert.ok(events.some((e) => e.id === malformed.id));
});

// ---------------------------------------------------------------------------
// (c) sourceId filtering and paging.
// ---------------------------------------------------------------------------

test('sourceId filtering excludes the requesting tab but keeps other tabs and NULL source_id', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_source_filter';

  const ownChange = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-own',
    action: 'update',
    data: JSON.stringify({ is_packed: true }),
    sourceId: 'tab-A',
  });
  const otherTabChange = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-other',
    action: 'update',
    data: JSON.stringify({ is_packed: true }),
    sourceId: 'tab-B',
  });
  const serverChange = await insertChange(db, {
    userId,
    entityType: 'tripItem',
    entityId: 'item-server',
    action: 'delete',
    data: null,
    sourceId: null,
  });

  const { status, events } = await pollEvents(d1, userId, { lastEventId: 0, sourceId: 'tab-A' });

  assert.equal(status, 200);
  const ids = events.map((e) => e.id);
  assert.ok(!ids.includes(ownChange.id), 'own tab change should be filtered out');
  assert.ok(ids.includes(otherTabChange.id), 'other tab change should still be delivered');
  assert.ok(ids.includes(serverChange.id), 'NULL source_id change should still be delivered');
});

test("user isolation: a poll never returns another user's changes", async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);

  await insertChange(db, {
    userId: 'user_a',
    entityType: 'trip',
    entityId: 'trip-a',
    action: 'create',
    data: JSON.stringify({ name: 'A Trip' }),
  });
  const forB = await insertChange(db, {
    userId: 'user_b',
    entityType: 'trip',
    entityId: 'trip-b',
    action: 'create',
    data: JSON.stringify({ name: 'B Trip' }),
  });

  const { events } = await pollEvents(d1, 'user_b', { lastEventId: 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, forB.id);
});

test('paging: results are capped at 50 rows, ordered ascending by id', async () => {
  const d1 = await createTestDatabase();
  const db = drizzle(d1);
  const userId = 'user_paging';

  const inserted: number[] = [];
  for (let i = 0; i < 60; i++) {
    const row = await insertChange(db, {
      userId,
      entityType: 'tripItem',
      entityId: `item-${i}`,
      action: 'create',
      data: JSON.stringify({ name: `Item ${i}` }),
    });
    inserted.push(row.id);
  }

  const { events } = await pollEvents(d1, userId, { lastEventId: 0 });

  assert.equal(events.length, 50, 'a single poll should cap at 50 rows');
  const ids = events.map((e) => e.id);
  assert.deepEqual(
    ids,
    [...ids].sort((a, b) => a - b),
    'results should be ordered ascending by id'
  );
  assert.deepEqual(ids, inserted.slice(0, 50));

  // A follow-up poll from the last-delivered id picks up the remaining rows.
  const { events: rest } = await pollEvents(d1, userId, { lastEventId: ids[ids.length - 1] });
  assert.equal(rest.length, 10);
  assert.deepEqual(
    rest.map((e) => e.id),
    inserted.slice(50)
  );
});
