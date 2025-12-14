import yaml from 'js-yaml';
import type { Trip, Bag, TripItem, Category, MasterItem, BagTemplate } from './types';
import { yamlTripExportSchema, yamlFullBackupSchema, validateRequestSafe } from './validation';

export interface TripExport {
  trip: {
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    notes: string | null;
  };
  bags: Array<{
    name: string;
    type: string;
    color: string | null;
    sort_order: number;
  }>;
  items: Array<{
    name: string;
    category_name: string | null;
    quantity: number;
    bag_name: string | null;
    is_packed: boolean;
    notes: string | null;
  }>;
}

export interface FullBackup {
  exportDate: string;
  version: string;
  categories: Array<{
    name: string;
    icon: string | null;
    sort_order: number;
  }>;
  masterItems: Array<{
    name: string;
    description: string | null;
    category_name: string | null;
    default_quantity: number;
  }>;
  bagTemplates: Array<{
    name: string;
    type: string;
    color: string | null;
    sort_order: number;
  }>;
  trips: Array<{
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    notes: string | null;
    bags: Array<{
      name: string;
      type: string;
      color: string | null;
      sort_order: number;
    }>;
    items: Array<{
      name: string;
      category_name: string | null;
      quantity: number;
      bag_name: string | null;
      is_packed: boolean;
      notes: string | null;
    }>;
  }>;
}

/**
 * Convert a trip with its bags and items to YAML format
 */
export function tripToYAML(
  trip: Trip,
  bags: Bag[],
  items: TripItem[]
): string {
  const exportData: TripExport = {
    trip: {
      name: trip.name,
      destination: trip.destination || '',
      start_date: trip.start_date || '',
      end_date: trip.end_date || '',
      notes: trip.notes,
    },
    bags: bags.map((bag) => ({
      name: bag.name,
      type: bag.type,
      color: bag.color,
      sort_order: bag.sort_order,
    })),
    items: items.map((item) => {
      const bag = bags.find((b) => b.id === item.bag_id);
      return {
        name: item.name,
        category_name: item.category_name,
        quantity: item.quantity,
        bag_name: bag?.name || null,
        is_packed: item.is_packed,
        notes: item.notes,
      };
    }),
  };

  return yaml.dump(exportData, {
    indent: 2,
    lineWidth: -1, // Don't wrap lines
    noRefs: true,
  });
}

/**
 * Parse YAML and return trip data structure
 * Now includes comprehensive validation and sanitization
 */
export function yamlToTrip(yamlString: string): TripExport {
  try {
    // Parse YAML with safe loader
    const parsed = yaml.load(yamlString, { schema: yaml.DEFAULT_SCHEMA });

    // Validate and sanitize the parsed data
    const validation = validateRequestSafe(yamlTripExportSchema, parsed);

    if (!validation.success) {
      throw new Error(`Invalid trip YAML structure: ${validation.error}`);
    }

    // Return validated and sanitized data
    return {
      trip: {
        name: validation.data.trip.name,
        destination: validation.data.trip.destination || '',
        start_date: validation.data.trip.start_date || '',
        end_date: validation.data.trip.end_date || '',
        notes: validation.data.trip.notes || null,
      },
      bags: validation.data.bags.map((bag) => ({
        name: bag.name,
        type: bag.type,
        color: bag.color || null,
        sort_order: bag.sort_order,
      })),
      items: validation.data.items.map((item) => ({
        name: item.name,
        category_name: item.category_name || null,
        quantity: item.quantity,
        bag_name: item.bag_name || null,
        is_packed: item.is_packed,
        notes: item.notes || null,
      })),
    };
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
  const backup: FullBackup = {
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
    })),
    bagTemplates: bagTemplates.map((template) => ({
      name: template.name,
      type: template.type,
      color: template.color,
      sort_order: template.sort_order,
    })),
    trips: trips.map(({ trip, bags, items }) => ({
      name: trip.name,
      destination: trip.destination || '',
      start_date: trip.start_date || '',
      end_date: trip.end_date || '',
      notes: trip.notes,
      bags: bags.map((bag) => ({
        name: bag.name,
        type: bag.type,
        color: bag.color,
        sort_order: bag.sort_order,
      })),
      items: items.map((item) => {
        const bag = bags.find((b) => b.id === item.bag_id);
        return {
          name: item.name,
          category_name: item.category_name,
          quantity: item.quantity,
          bag_name: bag?.name || null,
          is_packed: item.is_packed,
          notes: item.notes,
        };
      }),
    })),
  };

  return yaml.dump(backup, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

/**
 * Parse full backup YAML
 * Now includes comprehensive validation and sanitization
 */
export function yamlToFullBackup(yamlString: string): FullBackup {
  try {
    // Parse YAML with safe loader
    const parsed = yaml.load(yamlString, { schema: yaml.DEFAULT_SCHEMA });

    // Validate and sanitize the parsed data
    const validation = validateRequestSafe(yamlFullBackupSchema, parsed);

    if (!validation.success) {
      throw new Error(`Invalid backup YAML structure: ${validation.error}`);
    }

    // Return validated and sanitized data
    return {
      exportDate: validation.data.exportDate || new Date().toISOString(),
      version: validation.data.version,
      categories: validation.data.categories.map((cat) => ({
        name: cat.name,
        icon: cat.icon || null,
        sort_order: cat.sort_order,
      })),
      masterItems: validation.data.masterItems.map((item) => ({
        name: item.name,
        description: item.description || null,
        category_name: item.category_name || null,
        default_quantity: item.default_quantity,
      })),
      bagTemplates: validation.data.bagTemplates.map((template) => ({
        name: template.name,
        type: template.type,
        color: template.color || null,
        sort_order: template.sort_order,
      })),
      trips: validation.data.trips.map((trip) => ({
        name: trip.name,
        destination: trip.destination || '',
        start_date: trip.start_date || '',
        end_date: trip.end_date || '',
        notes: trip.notes || null,
        bags: trip.bags.map((bag) => ({
          name: bag.name,
          type: bag.type,
          color: bag.color || null,
          sort_order: bag.sort_order,
        })),
        items: trip.items.map((item) => ({
          name: item.name,
          category_name: item.category_name || null,
          quantity: item.quantity,
          bag_name: item.bag_name || null,
          is_packed: item.is_packed,
          notes: item.notes || null,
        })),
      })),
    };
  } catch (error) {
    throw new Error(`Failed to parse backup YAML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Download YAML content as a file
 */
export function downloadYAML(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/x-yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
