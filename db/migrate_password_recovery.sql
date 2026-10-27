-- Idempotent. Does not overwrite existing passwords or delete business records.
BEGIN;
CREATE TABLE IF NOT EXISTS admin_password_override (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    salt VARCHAR(64) NOT NULL,
    password_hash CHAR(64) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS password_reset_token (
    token_hash CHAR(64) PRIMARY KEY,
    principal_type VARCHAR(10) NOT NULL CHECK (principal_type IN ('admin','branch')),
    principal_id VARCHAR(32) NOT NULL,
    requested_email VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_password_reset_token_pending
    ON password_reset_token (principal_type, principal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_password_reset_token_expiry ON password_reset_token (expires_at);
COMMIT;
