-- Optional faction-specific audience for published orders.
-- Existing general/person/group orders keep their current behavior.
ALTER TABLE sang_orders ADD COLUMN audience_faction TEXT;

CREATE INDEX IF NOT EXISTS idx_sang_orders_audience_faction
ON sang_orders(audience_faction, status, order_date);
