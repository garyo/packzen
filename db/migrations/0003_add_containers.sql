-- Add container support: items can be containers (sub-bags) that hold other items
-- Container items have is_container=true and appear in their parent bag
-- Items inside containers have container_item_id pointing to the container

ALTER TABLE trip_items ADD COLUMN container_item_id TEXT;
ALTER TABLE trip_items ADD COLUMN is_container INTEGER NOT NULL DEFAULT 0;

ALTER TABLE master_items ADD COLUMN is_container INTEGER NOT NULL DEFAULT 0;

-- Index for efficient lookup of items by container
CREATE INDEX idx_trip_items_container ON trip_items(container_item_id);
