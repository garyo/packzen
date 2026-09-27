import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSorted, placeItems } from '../src/lib/item-placement';
import type { Bag, TripItem } from '../src/lib/types';

const bag = (id: string): Bag => ({
  id,
  trip_id: 't',
  name: id,
  type: 'custom',
  color: null,
  sort_order: 0,
  created_at: new Date(0),
});

const item = (id: string, fields: Partial<TripItem> = {}): TripItem => ({
  id,
  trip_id: 't',
  bag_id: null,
  master_item_id: null,
  container_item_id: null,
  is_container: false,
  name: id,
  category_name: null,
  quantity: 1,
  is_packed: false,
  is_skipped: false,
  notes: null,
  created_at: new Date(0),
  updated_at: new Date(0),
  ...fields,
});

const ids = (items: TripItem[] | undefined) => (items ?? []).map((i) => i.id);

test('items are placed in their bag, loose items under null', () => {
  const { byBag } = placeItems([item('a', { bag_id: 'b1' }), item('b')], [bag('b1')]);
  assert.deepEqual(ids(byBag.get('b1')), ['a']);
  assert.deepEqual(ids(byBag.get(null)), ['b']);
});

test('a container whose bag was deleted falls back to no bag, contents and all', () => {
  const items = [
    item('kit', { bag_id: 'gone', is_container: true }),
    item('brush', { container_item_id: 'kit' }),
  ];
  const { byBag, byContainer } = placeItems(items, [bag('b1')]);
  assert.deepEqual(ids(byBag.get(null)), ['kit']);
  assert.deepEqual(ids(byContainer.get('kit')), ['brush']);
});

test('contents of a missing container are not placed', () => {
  const { byBag, byContainer } = placeItems([item('orphan', { container_item_id: 'gone' })], []);
  assert.equal(byBag.size, 0);
  assert.equal(byContainer.size, 0);
});

test('groupSorted groups by key in key order', () => {
  const groups = groupSorted(['pear', 'apple', 'plum'], (s) => s[0]);
  assert.deepEqual(groups, [
    ['a', ['apple']],
    ['p', ['pear', 'plum']],
  ]);
});
