import test from 'node:test';
import assert from 'node:assert/strict';
import { LoadGate } from '../src/lib/sync-buffer';

// LoadGate coordinates two things that both race against a full-array
// snapshot replace: (1) remote sync events applied incrementally to the
// store, and (2) the snapshot load itself. While a load is in flight, remote
// events must be queued rather than applied, since the in-flight snapshot
// was fetched before them and would clobber them when it lands. Once the
// snapshot is applied, queued events must replay in order on top of it.

test('event submitted outside a load applies immediately', () => {
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  const queued = gate.submit('a', (e) => applied.push(e));

  assert.equal(queued, false);
  assert.deepEqual(applied, ['a']);
});

test('event submitted during a load is queued, not applied', () => {
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  gate.startLoad();
  const queued = gate.submit('a', (e) => applied.push(e));

  assert.equal(queued, true);
  assert.deepEqual(applied, []);
});

test('queued events replay in order once the load completes', () => {
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  gate.startLoad();
  gate.submit('create:1', (e) => applied.push(e));
  gate.submit('update:1', (e) => applied.push(e));
  gate.submit('delete:2', (e) => applied.push(e));

  assert.equal(applied.length, 0); // nothing applied yet - load still in flight

  gate.endLoad((e) => applied.push(e));

  assert.deepEqual(applied, ['create:1', 'update:1', 'delete:2']);
});

test('replay of an event the snapshot already reflects is a harmless no-op', () => {
  // Simulates: the snapshot fetch already picked up an update (because it
  // landed on the server before the snapshot query ran), and the same
  // update also arrived as a queued sync event. Replaying against a store
  // that already has the change applied must not corrupt anything - the
  // apply function here models an idempotent upsert.
  const gate = new LoadGate<{ id: string; v: number }>();
  const store = new Map<string, number>([['1', 2]]); // snapshot already has v=2

  gate.startLoad();
  gate.submit({ id: '1', v: 2 }, (e) => store.set(e.id, e.v));

  gate.endLoad((e) => store.set(e.id, e.v));

  assert.equal(store.get('1'), 2);
});

test('events after endLoad apply immediately again (gate re-arms)', () => {
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  gate.startLoad();
  gate.endLoad((e) => applied.push(e));

  const queued = gate.submit('a', (e) => applied.push(e));

  assert.equal(queued, false);
  assert.deepEqual(applied, ['a']);
});

test('overlapping loads only drain the queue once the last one ends', () => {
  // fetchItems() and silentRefresh() can both be in flight at once (e.g. a
  // post-mutation refetch overlapping a visibility-change silent refresh).
  // The queue must not drain - and the gate must not re-open - until every
  // in-flight load has finished, otherwise a remote event could slip through
  // and then get clobbered by the second snapshot's wholesale replace.
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  gate.startLoad(); // load #1 starts
  gate.startLoad(); // load #2 starts while #1 is still in flight

  const queued = gate.submit('a', (e) => applied.push(e));
  assert.equal(queued, true);

  gate.endLoad((e) => applied.push(e)); // load #1 finishes
  assert.equal(applied.length, 0, 'queue must stay held while load #2 is still in flight');
  assert.equal(gate.isLoading(), true);

  gate.endLoad((e) => applied.push(e)); // load #2 finishes
  assert.deepEqual(applied, ['a']);
  assert.equal(gate.isLoading(), false);
});

test('a load that ends without ever queuing anything is a no-op', () => {
  const gate = new LoadGate<string>();
  const applied: string[] = [];

  gate.startLoad();
  gate.endLoad((e) => applied.push(e));

  assert.deepEqual(applied, []);
  assert.equal(gate.isLoading(), false);
});
