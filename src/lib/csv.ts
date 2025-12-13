import type { MasterItem } from './types';

/**
 * Convert master items to CSV format
 */
export function masterItemsToCSV(items: MasterItem[]): string {
  const headers = ['name', 'description', 'category_name', 'default_quantity'];
  const rows = items.map((item) => [
    escapeCsvField(item.name),
    escapeCsvField(item.description || ''),
    escapeCsvField(item.category_name || ''),
    item.default_quantity.toString(),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

/**
 * Parse CSV to master items format
 */
export function csvToMasterItems(csv: string): Array<{
  name: string;
  description?: string;
  category_name?: string;
  default_quantity: number;
}> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have headers and at least one row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIndex = headers.indexOf('name');

  if (nameIndex === -1) {
    throw new Error('CSV must have a "name" column');
  }

  const descIndex = headers.findIndex((h) => h.includes('desc'));
  const categoryIndex = headers.findIndex((h) => h.includes('category'));
  const quantityIndex = headers.findIndex((h) => h.includes('quantity') || h.includes('qty'));

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const name = fields[nameIndex]?.trim();
    if (!name) continue;

    items.push({
      name,
      description: descIndex >= 0 ? fields[descIndex]?.trim() : undefined,
      category_name: categoryIndex >= 0 ? fields[categoryIndex]?.trim() : undefined,
      default_quantity: quantityIndex >= 0 ? parseInt(fields[quantityIndex] || '1') || 1 : 1,
    });
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

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField);

  return fields.map((f) => f.trim());
}
