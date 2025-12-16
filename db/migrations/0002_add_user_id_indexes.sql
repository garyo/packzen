-- Add indexes on clerk_user_id columns for better query performance
CREATE INDEX idx_categories_clerk_user_id ON categories(clerk_user_id);
--> statement-breakpoint
CREATE INDEX idx_master_items_clerk_user_id ON master_items(clerk_user_id);
--> statement-breakpoint
CREATE INDEX idx_trips_clerk_user_id ON trips(clerk_user_id);
--> statement-breakpoint
CREATE INDEX idx_bag_templates_clerk_user_id ON bag_templates(clerk_user_id);
