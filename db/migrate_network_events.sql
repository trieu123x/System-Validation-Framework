-- Network connection history; auto-created on server startup, safe on existing volumes.
CREATE TABLE IF NOT EXISTS network_events (
    id BIGSERIAL PRIMARY KEY,
    thoi_gian TIMESTAMP(3) NOT NULL,
    ma_cn VARCHAR(40) NOT NULL,
    su_kien VARCHAR(24) NOT NULL,
    ly_do VARCHAR(40) NOT NULL,
    ip VARCHAR(64),
    session_id BIGINT NOT NULL,
    gian_doan_ms BIGINT
);
CREATE INDEX IF NOT EXISTS idx_network_events_time ON network_events(thoi_gian DESC);
CREATE INDEX IF NOT EXISTS idx_network_events_branch ON network_events(ma_cn, id DESC);
