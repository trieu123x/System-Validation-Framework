-- Safe additive migration. ServerMain also performs ALTER TABLE on startup.
ALTER TABLE network_events ADD COLUMN IF NOT EXISTS browser_id VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_network_events_browser ON network_events(ma_cn, browser_id, id DESC);
