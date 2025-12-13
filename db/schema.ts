import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Categories table
export const categories = sqliteTable('categories', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  clerk_user_id: text('clerk_user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon'), // emoji or icon name
  sort_order: integer('sort_order').notNull().default(0),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Master Items table
export const masterItems = sqliteTable('master_items', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  clerk_user_id: text('clerk_user_id').notNull(),
  category_id: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  default_quantity: integer('default_quantity').notNull().default(1),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Trips table
export const trips = sqliteTable('trips', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  clerk_user_id: text('clerk_user_id').notNull(),
  name: text('name').notNull(),
  destination: text('destination'),
  start_date: text('start_date'), // ISO date string
  end_date: text('end_date'), // ISO date string
  notes: text('notes'),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Bags table (per trip)
export const bags = sqliteTable('bags', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  trip_id: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // "Carry-on", "Checked", "Personal Item"
  type: text('type').notNull(), // "carry_on", "checked", "personal", "custom"
  color: text('color'), // hex color for visual distinction
  sort_order: integer('sort_order').notNull().default(0),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Trip Items table (items copied/added to specific trips)
export const tripItems = sqliteTable('trip_items', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  trip_id: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  bag_id: text('bag_id').references(() => bags.id, { onDelete: 'set null' }),
  master_item_id: text('master_item_id').references(() => masterItems.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(), // Denormalized for flexibility
  category_name: text('category_name'), // Denormalized
  quantity: integer('quantity').notNull().default(1),
  is_packed: integer('is_packed', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Type exports for TypeScript
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type MasterItem = typeof masterItems.$inferSelect;
export type NewMasterItem = typeof masterItems.$inferInsert;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;

export type Bag = typeof bags.$inferSelect;
export type NewBag = typeof bags.$inferInsert;

export type TripItem = typeof tripItems.$inferSelect;
export type NewTripItem = typeof tripItems.$inferInsert;
