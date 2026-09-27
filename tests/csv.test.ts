import test from 'node:test';
import assert from 'node:assert/strict';
import { masterItemsToCSV, csvToMasterItems } from '../src/lib/csv';
import type { MasterItemWithCategory } from '../src/lib/types';

function masterItem(overrides: Partial<MasterItemWithCategory>): MasterItemWithCategory {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    clerk_user_id: 'user_1',
    category_id: null,
    category_name: null,
    name: 'Item',
    description: null,
    default_quantity: 1,
    is_container: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

test('CSV round-trips names, descriptions, categories, quantities and is_container', () => {
  const items = [
    masterItem({ name: 'Toiletry Kit', category_name: 'Toiletries', is_container: true }),
    masterItem({
      name: 'Socks, wool',
      description: 'Two "good" pairs\nand one spare',
      category_name: 'Clothing',
      default_quantity: 3,
    }),
  ];

  const parsed = csvToMasterItems(masterItemsToCSV(items));

  assert.deepEqual(parsed, [
    {
      name: 'Toiletry Kit',
      description: undefined,
      category_name: 'Toiletries',
      default_quantity: 1,
      is_container: true,
    },
    {
      name: 'Socks, wool',
      description: 'Two "good" pairs\nand one spare',
      category_name: 'Clothing',
      default_quantity: 3,
      is_container: false,
    },
  ]);
});

test('CSV export neutralizes spreadsheet formulas and import restores the text', () => {
  const items = [
    masterItem({
      name: '=HYPERLINK("http://evil")',
      description: '+1 spare',
      category_name: '@cat',
    }),
    masterItem({ name: "'90s tee", description: '-dash' }),
  ];

  const csv = masterItemsToCSV(items);
  assert.ok(
    csv.includes(`"'=HYPERLINK(""http://evil"")"`),
    'formula cell is prefixed with a quote'
  );
  assert.ok(csv.includes(`"'+1 spare"`));
  assert.ok(csv.includes(`"'@cat"`));

  const parsed = csvToMasterItems(csv);
  assert.equal(parsed[0].name, '=HYPERLINK("http://evil")');
  assert.equal(parsed[0].description, '+1 spare');
  assert.equal(parsed[0].category_name, '@cat');
  assert.equal(parsed[1].name, "'90s tee", 'an ordinary leading apostrophe is kept');
  assert.equal(parsed[1].description, '-dash');
});

test('CSV without an is_container column leaves the container flag unset', () => {
  const parsed = csvToMasterItems('name,default_quantity\nToiletry Kit,1\n');
  assert.equal(parsed[0].is_container, undefined);
});
