import Papa from 'papaparse';
import type { MasterItemWithCategory } from './types';

/**
 * Convert master items to CSV format
 * Uses PapaParse for robust CSV generation
 */
export function masterItemsToCSV(items: MasterItemWithCategory[]): string {
  const data = items.map((item) => ({
    name: item.name,
    description: item.description || '',
    category_name: item.category_name || '',
    default_quantity: item.default_quantity,
  }));

  return Papa.unparse(data, {
    header: true,
    quotes: true, // Quote all fields for safety
  });
}

/**
 * Parse CSV to master items format
 * Uses PapaParse for robust CSV parsing with proper edge case handling
 */
export function csvToMasterItems(csv: string): Array<{
  name: string;
  description?: string;
  category_name?: string;
  default_quantity: number;
}> {
  const result = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.toLowerCase().trim(),
  });

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map((e: Papa.ParseError) => e.message).join(', ');
    throw new Error(`CSV parsing errors: ${errorMessages}`);
  }

  if (!result.data || result.data.length === 0) {
    throw new Error('CSV must have at least one row');
  }

  // Find name column (required)
  const firstRow = result.data[0] as Record<string, string>;
  const hasNameColumn = 'name' in firstRow;

  if (!hasNameColumn) {
    throw new Error('CSV must have a "name" column');
  }

  // Parse and validate items
  const items = (result.data as Array<Record<string, string>>)
    .map((row, index) => {
      const name = row.name?.trim();
      if (!name) {
        console.warn(`Skipping row ${index + 2}: missing name`);
        return null;
      }

      const quantityStr = row.default_quantity?.trim() || '1';
      const quantity = parseInt(quantityStr, 10);

      return {
        name,
        description: row.description?.trim() || undefined,
        category_name: row.category_name?.trim() || undefined,
        default_quantity: isNaN(quantity) || quantity < 1 ? 1 : quantity,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) {
    throw new Error('No valid items found in CSV');
  }

  return items;
}

/**
 * Download data as CSV file
 */
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
