import test from 'node:test';
import assert from 'node:assert/strict';
import { exclusivePackState, packingProgress, packingStats } from '../src/lib/packing-stats';

const item = (is_packed: boolean, is_skipped: boolean) => ({ is_packed, is_skipped });

test('empty list has nothing to pack', () => {
  const stats = packingStats([]);
  assert.deepEqual(stats, { total: 0, packed: 0, skipped: 0, remaining: 0 });
  assert.equal(packingProgress(stats), 0);
});

test('skipped items are excluded from the total', () => {
  const stats = packingStats([item(false, false), item(true, false), item(false, true)]);
  assert.deepEqual(stats, { total: 2, packed: 1, skipped: 1, remaining: 1 });
  assert.equal(packingProgress(stats), 50);
});

test('an item both packed and skipped counts once, as skipped', () => {
  const stats = packingStats([item(true, true), item(true, false)]);
  assert.deepEqual(stats, { total: 1, packed: 1, skipped: 1, remaining: 0 });
  assert.equal(packingProgress(stats), 100);
});

test('progress never exceeds 100%', () => {
  const stats = packingStats([item(true, true), item(true, true), item(true, false)]);
  assert.equal(packingProgress(stats), 100);
});

test('packing clears skipped, skipping clears packed', () => {
  assert.deepEqual(exclusivePackState({ is_packed: true }), { is_packed: true, is_skipped: false });
  assert.deepEqual(exclusivePackState({ is_skipped: true }), {
    is_skipped: true,
    is_packed: false,
  });
});

test('unpacking, unskipping and unrelated patches are left alone', () => {
  assert.deepEqual(exclusivePackState({ is_packed: false }), { is_packed: false });
  assert.deepEqual(exclusivePackState({ is_skipped: false }), { is_skipped: false });
  assert.deepEqual(exclusivePackState({ bag_id: 'b1' }), { bag_id: 'b1' });
});
