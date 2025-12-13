import yaml from 'js-yaml';
import type { Trip, Bag, TripItem, Category, MasterItem } from './types';

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
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
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
 */
export function yamlToTrip(yamlString: string): TripExport {
  try {
    const parsed = yaml.load(yamlString) as TripExport;

    if (!parsed.trip || !parsed.trip.name) {
      throw new Error('Invalid trip data: missing trip name');
    }

    return {
      trip: {
        name: parsed.trip.name || '',
        destination: parsed.trip.destination || '',
        start_date: parsed.trip.start_date || '',
        end_date: parsed.trip.end_date || '',
        notes: parsed.trip.notes || null,
      },
      bags: Array.isArray(parsed.bags)
        ? parsed.bags.map((bag) => ({
            name: bag.name || '',
            type: bag.type || 'carry_on',
            color: bag.color || null,
            sort_order: bag.sort_order || 0,
          }))
        : [],
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item) => ({
            name: item.name || '',
            category_name: item.category_name || null,
            quantity: item.quantity || 1,
            bag_name: item.bag_name || null,
            is_packed: item.is_packed || false,
            notes: item.notes || null,
          }))
        : [],
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
    trips: trips.map(({ trip, bags, items }) => ({
      name: trip.name,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
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
 */
export function yamlToFullBackup(yamlString: string): FullBackup {
  try {
    const parsed = yaml.load(yamlString) as FullBackup;

    if (!parsed.version) {
      throw new Error('Invalid backup: missing version');
    }

    return {
      exportDate: parsed.exportDate || new Date().toISOString(),
      version: parsed.version,
      categories: Array.isArray(parsed.categories)
        ? parsed.categories.map((cat) => ({
            name: cat.name || '',
            icon: cat.icon || null,
            sort_order: cat.sort_order || 0,
          }))
        : [],
      masterItems: Array.isArray(parsed.masterItems)
        ? parsed.masterItems.map((item) => ({
            name: item.name || '',
            description: item.description || null,
            category_name: item.category_name || null,
            default_quantity: item.default_quantity || 1,
          }))
        : [],
      trips: Array.isArray(parsed.trips)
        ? parsed.trips.map((trip) => ({
            name: trip.name || '',
            destination: trip.destination || '',
            start_date: trip.start_date || '',
            end_date: trip.end_date || '',
            notes: trip.notes || null,
            bags: Array.isArray(trip.bags)
              ? trip.bags.map((bag) => ({
                  name: bag.name || '',
                  type: bag.type || 'carry_on',
                  color: bag.color || null,
                  sort_order: bag.sort_order || 0,
                }))
              : [],
            items: Array.isArray(trip.items)
              ? trip.items.map((item) => ({
                  name: item.name || '',
                  category_name: item.category_name || null,
                  quantity: item.quantity || 1,
                  bag_name: item.bag_name || null,
                  is_packed: item.is_packed || false,
                  notes: item.notes || null,
                }))
              : [],
          }))
        : [],
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
