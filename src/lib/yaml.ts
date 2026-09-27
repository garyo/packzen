import yaml from 'js-yaml';
import type { z } from 'zod';
import type { Trip, Bag, TripItem, Category, MasterItem, BagTemplate } from './types';
import {
  yamlTripExportSchema,
  yamlFullBackupSchema,
  validateRequestSafe,
  type YamlTripExport,
  type YamlFullBackup,
} from './validation';
import { downloadFile } from './utils';

/** A parsed, validated single-trip export. */
export type TripExport = YamlTripExport;
/** A parsed, validated full backup. */
export type FullBackup = YamlFullBackup;
export type BackupTrip = FullBackup['trips'][number];
export type BackupBag = BackupTrip['bags'][number];
export type BackupItem = BackupTrip['items'][number];

// What the exporters write: the schema's input, so defaulted fields may be omitted.
type YamlTripInput = z.input<typeof yamlTripExportSchema>;
type YamlBag = NonNullable<YamlTripInput['bags']>[number];
type YamlItem = NonNullable<YamlTripInput['items']>[number];
// The database stores bag types as plain text; the schema validates them on import.
type BagTypeName = YamlBag['type'];

const DUMP_OPTIONS: yaml.DumpOptions = {
  indent: 2,
  lineWidth: -1, // Don't wrap lines
  noRefs: true,
};

function bagToYaml(bag: Bag): YamlBag {
  return {
    source_id: bag.id,
    name: bag.name,
    type: bag.type as BagTypeName,
    color: bag.color,
    sort_order: bag.sort_order,
  };
}

function itemsToYaml(bags: Bag[], items: TripItem[]): YamlItem[] {
  return items.map((item) => {
    const bag = bags.find((b) => b.id === item.bag_id);
    const container = item.container_item_id
      ? items.find((i) => i.id === item.container_item_id)
      : null;
    return {
      source_id: item.id,
      bag_source_id: item.bag_id || null,
      container_source_id: item.container_item_id || null,
      name: item.name,
      category_name: item.category_name,
      quantity: item.quantity,
      bag_name: bag?.name || null,
      is_packed: item.is_packed,
      is_skipped: item.is_skipped || undefined,
      notes: item.notes,
      is_container: item.is_container || undefined,
      container_name: container?.name || undefined,
      master_item_id: item.master_item_id || null,
    };
  });
}

function tripFieldsToYaml(trip: Trip) {
  return {
    source_id: trip.id,
    name: trip.name,
    destination: trip.destination || '',
    start_date: trip.start_date || '',
    end_date: trip.end_date || '',
    notes: trip.notes,
  };
}

/**
 * Convert a trip with its bags and items to YAML format
 */
export function tripToYAML(trip: Trip, bags: Bag[], items: TripItem[]): string {
  const exportData: YamlTripInput = {
    trip: tripFieldsToYaml(trip),
    bags: bags.map(bagToYaml),
    items: itemsToYaml(bags, items),
  };
  return yaml.dump(exportData, DUMP_OPTIONS);
}

/**
 * Convert full backup data to YAML format
 */
export function fullBackupToYAML(
  categories: Category[],
  masterItems: (MasterItem & { category_name?: string | null })[],
  bagTemplates: BagTemplate[],
  trips: Array<{
    trip: Trip;
    bags: Bag[];
    items: TripItem[];
  }>
): string {
  const backup: z.input<typeof yamlFullBackupSchema> = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    categories: categories.map((cat) => ({
      name: cat.name,
      icon: cat.icon,
      sort_order: cat.sort_order,
    })),
    masterItems: masterItems.map((item) => ({
      name: item.name,
      description: item.description,
      category_name: item.category_name || null,
      default_quantity: item.default_quantity,
      is_container: item.is_container || undefined,
    })),
    bagTemplates: bagTemplates.map((template) => ({
      source_id: template.id,
      name: template.name,
      type: template.type as BagTypeName,
      color: template.color,
      sort_order: template.sort_order,
    })),
    trips: trips.map(({ trip, bags, items }) => ({
      ...tripFieldsToYaml(trip),
      bags: bags.map(bagToYaml),
      items: itemsToYaml(bags, items),
    })),
  };
  return yaml.dump(backup, DUMP_OPTIONS);
}

/**
 * DEFAULT_SCHEMA parses unquoted dates like `2026-06-01` into JS `Date` objects
 * (that's also what gives us yes/no/on/off -> boolean, which we want to keep).
 * The Zod schemas expect plain 'YYYY-MM-DD' strings, so walk the parsed tree and
 * convert any Date back to that format before validation.
 */
function coerceDatesToStrings(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) {
    return value.map(coerceDatesToStrings);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, coerceDatesToStrings(val)])
    );
  }
  return value;
}

/** Parse YAML and validate/sanitize it against `schema`; throws a readable error. */
function parseYaml<T>(text: string, schema: z.ZodType<T>, label: string): T {
  try {
    const parsed = coerceDatesToStrings(yaml.load(text, { schema: yaml.DEFAULT_SCHEMA }));
    const validation = validateRequestSafe(schema, parsed);
    if (!validation.success) {
      throw new Error(`Invalid ${label} YAML structure: ${validation.error}`);
    }
    return validation.data;
  } catch (error) {
    throw new Error(
      `Failed to parse ${label} YAML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function yamlToTrip(yamlString: string): TripExport {
  return parseYaml(yamlString, yamlTripExportSchema, 'trip');
}

export function yamlToFullBackup(yamlString: string): FullBackup {
  return parseYaml(yamlString, yamlFullBackupSchema, 'backup');
}

export function downloadYAML(content: string, filename: string): void {
  downloadFile(filename, content, 'application/x-yaml');
}
