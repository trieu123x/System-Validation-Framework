# Thay đổi Anti-scraping V1

Hướng dẫn chạy và giới hạn kiểm chứng: [ANTI_SCRAPING.md](ANTI_SCRAPING.md).

Không xóa tệp source nào trong ZIP gốc. Không kèm dependency, cache hay binary build.

## Sửa đổi

- `.env.example`
- `README.md`
- `client/src/main/java/phanphoi/client/BranchAgent.java`
- `client/src/main/java/phanphoi/client/ClientMain.java`
- `client/src/main/java/phanphoi/client/ClientSecurity.java`
- `common/src/main/java/phanphoi/common/web/Http.java`
- `common/src/main/java/phanphoi/common/web/SseHub.java`
- `config/client.properties`
- `config/server.properties`
- `db/schema.sql`
- `docker/entrypoint.sh`
- `docker-compose.yml`
- `server/src/main/java/phanphoi/server/AdminApi.java`
- `server/src/main/java/phanphoi/server/ServerContext.java`
- `server/src/main/java/phanphoi/server/ServerMain.java`
- `server/src/main/java/phanphoi/server/mail/EmailNotifications.java`
- `server/src/main/java/phanphoi/server/mail/MailSettings.java`
- `server/src/main/java/phanphoi/server/security/SecurityEvent.java`
- `server/src/main/java/phanphoi/server/security/SecurityEventLog.java`
- `server/src/main/java/phanphoi/server/security/SecurityMonitor.java`
- `server/src/main/java/phanphoi/server/security/SecurityRules.java`
- `ui/app/branch/page.tsx`
- `ui/components/admin/Security.tsx`
- `ui/lib/api.ts`
- `ui/lib/types.ts`

## Bổ sung

- `common/src/main/java/phanphoi/common/security/ScrapingGuard.java`
- `common/src/main/java/phanphoi/common/security/ScrapingPolicy.java`
- `common/src/main/java/phanphoi/common/web/BrowserSessions.java`
- `common/src/test/java/phanphoi/common/security/ScrapingAcceptance.java`
- `common/src/test/java/phanphoi/common/security/ScrapingGuardTest.java`
- `common/src/test/java/phanphoi/common/web/BrowserSessionsTest.java`
- `db/migrate_anti_scraping.sql`
- `docs/ANTI_SCRAPING.md`
- `docs/ANTI_SCRAPING_PLAN_REFERENCE.md`
- `scripts/check-anti-scraping.bat`
- `scripts/migrate-anti-scraping.bat`
- `scripts/security-retention.sql`
- `scripts/smoke-anti-scraping.py`
- `server/src/main/java/phanphoi/server/security/ScrapingStore.java`
- `server/src/test/java/phanphoi/server/mail/ScrapingEmailTest.java`
