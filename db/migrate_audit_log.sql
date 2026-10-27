-- Safe for existing volumes; server also creates this table automatically on startup.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nguon VARCHAR(12) NOT NULL,
    actor VARCHAR(80) NOT NULL,
    hanh_dong VARCHAR(80) NOT NULL,
    chi_tiet VARCHAR(500) NOT NULL,
    ket_qua VARCHAR(20) NOT NULL,
    ip VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(thoi_gian DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time ON audit_log(actor, thoi_gian DESC);
