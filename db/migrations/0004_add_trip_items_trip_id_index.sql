-- Add index on trip_items.trip_id for faster COUNT queries (resource limits)
-- and general trip item lookups
CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id ON trip_items(trip_id);
