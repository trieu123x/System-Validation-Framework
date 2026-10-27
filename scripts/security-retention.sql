-- PostgreSQL. Run manually after choosing a retention period; no automatic deletion on startup.
-- Only security records, never sales/inventory/business data.
BEGIN;
DELETE FROM security_email_delivery WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
DELETE FROM su_kien_bao_mat WHERE thoi_gian < CURRENT_TIMESTAMP - INTERVAL '30 days';
DELETE FROM security_scraping_blocks WHERE expires_at < EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000;
COMMIT;
