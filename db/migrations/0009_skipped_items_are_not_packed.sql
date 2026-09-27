-- An item is unpacked, packed, or skipped — never both packed and skipped.
-- Skipping wins, matching the API: a patch that skips an item also unpacks it.
UPDATE trip_items SET is_packed = 0 WHERE is_skipped = 1;
