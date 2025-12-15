/**
 * Validation script for built-in items data
 * Ensures data integrity and reports statistics
 */

import fs from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const YAML_PATH = join(__dirname, '../src/data/built-in-items.yaml');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateBuiltInItems() {
  log('\n📋 Validating built-in items data...', 'cyan');

  // Load YAML file
  let data;
  try {
    const yamlContent = fs.readFileSync(YAML_PATH, 'utf8');
    data = yaml.load(yamlContent);
  } catch (error) {
    log(`✗ Failed to load YAML file: ${error.message}`, 'red');
    process.exit(1);
  }

  const { categories, trip_types, items } = data;
  const errors = [];
  const warnings = [];

  // Validation 1: Check data structure
  if (!categories || !Array.isArray(categories)) {
    errors.push('Missing or invalid categories array');
  }
  if (!trip_types || !Array.isArray(trip_types)) {
    errors.push('Missing or invalid trip_types array');
  }
  if (!items || !Array.isArray(items)) {
    errors.push('Missing or invalid items array');
  }

  if (errors.length > 0) {
    errors.forEach((err) => log(`✗ ${err}`, 'red'));
    process.exit(1);
  }

  // Validation 1.5: Validate categories
  categories.forEach((category, index) => {
    const catLabel = `Category #${index + 1} "${category.name}"`;
    if (!category.name || typeof category.name !== 'string') {
      errors.push(`${catLabel}: Missing or invalid name`);
    }
    if (!category.icon || typeof category.icon !== 'string') {
      errors.push(`${catLabel}: Missing or invalid icon`);
    }
    if (typeof category.sort_order !== 'number') {
      errors.push(`${catLabel}: Missing or invalid sort_order (must be number)`);
    }
  });

  // Check for duplicate sort_order values
  const sortOrders = categories.map((c) => c.sort_order).filter((s) => typeof s === 'number');
  const uniqueSortOrders = new Set(sortOrders);
  if (sortOrders.length !== uniqueSortOrders.size) {
    errors.push('Duplicate sort_order values found in categories');
  }

  if (errors.length > 0) {
    errors.forEach((err) => log(`✗ ${err}`, 'red'));
    process.exit(1);
  }

  // Build lookup sets
  const categoryNames = new Set(categories.map((c) => c.name));
  const tripTypeIds = new Set(trip_types.map((t) => t.id));
  const itemsPerCategory = new Map();
  const itemsPerTripType = new Map();

  // Initialize counters
  categories.forEach((c) => itemsPerCategory.set(c.name, 0));
  trip_types.forEach((t) => itemsPerTripType.set(t.id, 0));

  // Validation 2: Validate each item
  items.forEach((item, index) => {
    const itemLabel = `Item #${index + 1} "${item.name}"`;

    // Check required fields
    if (!item.name || typeof item.name !== 'string') {
      errors.push(`${itemLabel}: Missing or invalid name`);
    }
    if (item.description !== null && typeof item.description !== 'string') {
      errors.push(`${itemLabel}: Invalid description (must be string or null)`);
    }
    if (!item.category || typeof item.category !== 'string') {
      errors.push(`${itemLabel}: Missing or invalid category`);
    }
    if (typeof item.default_quantity !== 'number' || item.default_quantity < 1) {
      errors.push(`${itemLabel}: Invalid default_quantity (must be number >= 1)`);
    }
    if (!Array.isArray(item.trip_types)) {
      errors.push(`${itemLabel}: trip_types must be an array`);
    }

    // Check category exists
    if (item.category && !categoryNames.has(item.category)) {
      errors.push(`${itemLabel}: Unknown category "${item.category}"`);
    } else if (item.category) {
      itemsPerCategory.set(item.category, itemsPerCategory.get(item.category) + 1);
    }

    // Check trip types
    if (Array.isArray(item.trip_types)) {
      if (item.trip_types.length === 0) {
        warnings.push(`${itemLabel}: No trip types assigned`);
      }

      item.trip_types.forEach((tripType) => {
        if (!tripTypeIds.has(tripType)) {
          errors.push(`${itemLabel}: Unknown trip type "${tripType}"`);
        } else {
          itemsPerTripType.set(tripType, itemsPerTripType.get(tripType) + 1);
        }
      });
    }

    // Check for duplicate names (case-insensitive)
    const duplicates = items.filter(
      (otherItem, otherIndex) =>
        otherIndex !== index && otherItem.name.toLowerCase() === item.name.toLowerCase()
    );
    if (duplicates.length > 0) {
      errors.push(`${itemLabel}: Duplicate item name (case-insensitive)`);
    }
  });

  // Validation 3: Check for unused categories
  categories.forEach((category) => {
    const count = itemsPerCategory.get(category.name);
    if (count === 0) {
      warnings.push(`Category "${category.name}" has no items`);
    }
  });

  // Validation 4: Check for unused trip types
  trip_types.forEach((tripType) => {
    const count = itemsPerTripType.get(tripType.id);
    if (count === 0) {
      warnings.push(`Trip type "${tripType.name}" (${tripType.id}) has no items`);
    }
  });

  // Report results
  log('\n📊 Statistics:', 'blue');
  log(`   Categories: ${categories.length}`);
  log(`   Trip Types: ${trip_types.length}`);
  log(`   Total Items: ${items.length}`);

  log('\n📦 Items per Category:', 'blue');
  const sortedCategories = Array.from(itemsPerCategory.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  sortedCategories.forEach(([category, count]) => {
    const icon = categories.find((c) => c.name === category)?.icon || '?';
    const color = count === 0 ? 'yellow' : 'reset';
    log(`   ${icon} ${category.padEnd(20)} ${count} items`, color);
  });

  log('\n🏷️  Items per Trip Type:', 'blue');
  const sortedTripTypes = Array.from(itemsPerTripType.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  sortedTripTypes.forEach(([tripTypeId, count]) => {
    const tripType = trip_types.find((t) => t.id === tripTypeId);
    const color = count === 0 ? 'yellow' : 'reset';
    log(`   ${tripType?.name.padEnd(20)} ${count} items`, color);
  });

  // Print warnings
  if (warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    warnings.forEach((warning) => log(`   ${warning}`, 'yellow'));
  }

  // Print errors
  if (errors.length > 0) {
    log('\n✗ Errors:', 'red');
    errors.forEach((error) => log(`   ${error}`, 'red'));
    log(`\n✗ Validation failed with ${errors.length} error(s)\n`, 'red');
    process.exit(1);
  }

  // Success
  if (warnings.length > 0) {
    log(`\n✓ Validation passed with ${warnings.length} warning(s)\n`, 'green');
  } else {
    log('\n✓ Validation passed! All checks successful.\n', 'green');
  }
}

// Run validation
validateBuiltInItems();
