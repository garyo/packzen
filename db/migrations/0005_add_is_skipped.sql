-- Add is_skipped column to trip_items table
ALTER TABLE trip_items ADD COLUMN is_skipped INTEGER NOT NULL DEFAULT 0;
