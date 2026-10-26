-- PostgreSQL, additive/idempotent; no DROP and no seed reset.
BEGIN;
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS event_key VARCHAR(36);
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS review VARCHAR(20);
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS review_reason VARCHAR(500);
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_event_key ON su_kien_bao_mat(event_key);
CREATE INDEX IF NOT EXISTS idx_security_type_time ON su_kien_bao_mat(loai, thoi_gian);
CREATE TABLE IF NOT EXISTS security_scraping_blocks (
    subject VARCHAR(160) PRIMARY KEY,
    expires_at BIGINT NOT NULL,
    reason VARCHAR(500) NOT NULL
);
CREATE TABLE IF NOT EXISTS security_email_delivery (
    id BIGSERIAL PRIMARY KEY,
    event_key VARCHAR(36) NOT NULL,
    recipient VARCHAR(320) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_key, recipient)
);
CREATE INDEX IF NOT EXISTS idx_security_email_time ON security_email_delivery(updated_at);
COMMIT;
