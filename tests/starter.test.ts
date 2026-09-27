import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtInItems,
  getStarterItems,
  getStarterQuantity,
  suggestStarter,
  type StarterModifier,
} from '../src/lib/built-in-items';
import type { BuiltInItem } from '../src/lib/types';

const tripTypeIds = builtInItems.trip_types.map((t) => t.id);
const excluded = new Set(['Baby', 'Children']);
const names = (items: BuiltInItem[]) => new Set(items.map((i) => i.name));

test('starter lists: every universal essential is in every trip type', () => {
  const essentials = builtInItems.items.filter((i) => i.essential && !excluded.has(i.category));
  assert.ok(essentials.length > 0);
  for (const tripType of tripTypeIds) {
    const starter = names(getStarterItems(tripType));
    for (const item of essentials) {
      assert.ok(starter.has(item.name), `${item.name} missing from ${tripType}`);
    }
  }
});

test('starter lists: only gated items whose gates are all met, never Baby/Children', () => {
  const modifierSets: StarterModifier[][] = [[], ['international'], ['feminine', 'masculine']];
  for (const tripType of tripTypeIds) {
    for (const modifiers of modifierSets) {
      for (const item of getStarterItems(tripType, modifiers)) {
        assert.ok(!excluded.has(item.category), `${item.name} is in an excluded category`);
        if (item.essential) continue;
        const tripGate = item.essential_trip_types;
        const modGate = item.essential_modifiers;
        assert.ok(tripGate?.length || modGate?.length, `${item.name} has no essential gate`);
        if (tripGate?.length) assert.ok(tripGate.includes(tripType));
        if (modGate?.length) {
          assert.ok(modGate.some((m) => modifiers.includes(m as StarterModifier)));
        }
      }
    }
  }
});

test('starter lists: modifiers only add items', () => {
  for (const tripType of tripTypeIds) {
    const base = names(getStarterItems(tripType));
    for (const modifier of ['international', 'feminine', 'masculine'] as const) {
      const withModifier = names(getStarterItems(tripType, [modifier]));
      for (const name of base) assert.ok(withModifier.has(name), `${modifier} dropped ${name}`);
    }
  }
  const modifierOnly = builtInItems.items.find(
    (i) => i.essential_modifiers?.length && !i.essential_trip_types?.length && !i.essential
  );
  assert.ok(modifierOnly, 'data has a modifier-only essential');
  const modifier = modifierOnly.essential_modifiers![0] as StarterModifier;
  assert.ok(!names(getStarterItems(tripTypeIds[0])).has(modifierOnly.name));
  assert.ok(names(getStarterItems(tripTypeIds[0], [modifier])).has(modifierOnly.name));
});

test('starter quantity: per-day items scale with nights and cap at the default', () => {
  const item = (per_day: boolean, default_quantity: number): BuiltInItem => ({
    name: 'Socks',
    description: null,
    category: 'Clothing',
    default_quantity,
    trip_types: [],
    per_day,
  });

  for (const tripType of builtInItems.trip_types) {
    assert.equal(getStarterQuantity(item(false, 2), tripType.id), 2, 'fixed items keep default');
    assert.equal(getStarterQuantity(item(true, 99), tripType.id), tripType.nights + 1);
    assert.equal(getStarterQuantity(item(true, 1), tripType.id), 1, 'never above the default');
  }
  assert.equal(
    getStarterQuantity(item(true, 99), 'no-such-type'),
    4,
    'unknown types assume 3 nights'
  );
});

test('starter suggestion: the first trip-type word in the name wins', () => {
  assert.deepEqual(suggestStarter('Beach weekend'), { tripTypeId: 'beach', international: false });
  assert.equal(suggestStarter('Weekend at the beach').tripTypeId, 'weekend');
  assert.equal(suggestStarter('Hikes in Utah').tripTypeId, 'hiking');
  assert.equal(suggestStarter('Grandma').tripTypeId, undefined);
  // Whole words only: "weekend" doesn't suggest a week-long trip.
  assert.equal(suggestStarter('Long weekend!').tripTypeId, 'weekend');
});

test('starter suggestion: international is an option, never the trip type', () => {
  assert.deepEqual(suggestStarter('Business trip abroad'), {
    tripTypeId: 'business',
    international: true,
  });
  assert.equal(suggestStarter('International').tripTypeId, undefined);
});

test('every trip type has a default trip name and keywords', () => {
  for (const tripType of builtInItems.trip_types) {
    assert.ok(tripType.trip_name, `${tripType.id} has no trip_name`);
    assert.ok(tripType.keywords.length > 0, `${tripType.id} has no keywords`);
  }
});
