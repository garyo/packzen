-- Index the foreign keys that are looked up or cascaded through. Without these,
-- each bag/master-item/category delete scans the child table to apply its
-- ON DELETE SET NULL, and the trips list's bag_count subquery scans all bags.
CREATE INDEX IF NOT EXISTS idx_bags_trip_id ON bags(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_bag_id ON trip_items(bag_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_master_item_id ON trip_items(master_item_id);
CREATE INDEX IF NOT EXISTS idx_master_items_category_id ON master_items(category_id);

-- The change-log prune deletes old rows across all users by age.
CREATE INDEX IF NOT EXISTS idx_change_log_created_at ON change_log(created_at);
