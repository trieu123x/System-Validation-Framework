# Audit log (Docker console + PostgreSQL)

## What is recorded

- `BRANCH`: successful/failed login and TCP operations such as `SALE`, `LOW_STOCK`, `ACCEPT`, `REJECT`, `RECEIVED`, `TRANSFER_ACCEPT`, `TRANSFER_REJECT`, `INVENTORY_GET`, `HISTORY_GET`, `DEBT_GET`, `NOTICE_REPLY`, `SET_THRESHOLD` and `LOGOUT`.
- `ADMIN`: login/logout and the authenticated business endpoints, including stock import, supply proposals, **shipment**, shortage, warehouse replenishment, debt payments, products, notices, and related queries.
- Every audit row stores time, source, actor (admin/branch), action, safe identifiers/quantities, result, and remote IP.
- Rejected business operations are recorded as `E01`, `E03`, `E04`, etc. or `HTTP_4xx/5xx`. A `SUCCESS` means the relevant handler completed, not that delivery to an offline branch has been acknowledged.
- Keep the existing `su_kien_bao_mat` table and security/email alerts separately. These remain unchanged.

No passwords, password-reset tokens, cookies, HTTP request body dumps, or arbitrary notice text are deliberately included in the **new audit table**. New inbound TCP `LOGIN` entries in `nhat_ky` also redact the identifier and password. **Old** `nhat_ky` records (from before this update) are not modified and may contain credentials; review retention/access to historical data separately.

## Deploy and view

On Windows, in the repository root, keep your existing `.env` and run:

```powershell
.\scripts\docker-deploy.bat
# Live console output (only audit messages):
docker compose logs -f -t server | Select-String '\[AUDIT\]'
```

A new `audit_log` table and indexes are automatically created by the server on startup, even when using the existing Docker volume. `db/migrate_audit_log.sql` is provided if manual migration is preferred. The deployment does not need `docker compose down -v` and does not reset data.

Admin UI: **Giám sát → Nhật ký thao tác**. Filter by branch or source, then click **Làm mới**. The read-only endpoint is `GET /api/audit?actor=CN03&limit=100`, requiring an admin session.

Direct SQL checks:

```powershell
docker compose exec db psql -U postgres -d phan_phoi_hang -c "SELECT thoi_gian, nguon, actor, hanh_dong, chi_tiet, ket_qua FROM audit_log ORDER BY id DESC LIMIT 30;"
```

## Test

1. Start `docker compose logs -f -t server` in a terminal.
2. Login to the shared client UI as CN03. Check for `[AUDIT] BRANCH | CN03 | LOGIN ... SUCCESS`.
3. Create a stock request, perform a sale or acknowledge stock receipt. Check the specific command (`LOW_STOCK`, `SALE`, `RECEIVED`, etc.) and its identifiers/quantities.
4. Login to the admin UI and ship/request goods. Check for `POST /api/requests/{id}/ship` with `maYc`, `soLuong`, `maCn` and `maSp` (the latter two if the enrichment query succeeds).
5. Open **Giám sát → Nhật ký thao tác**, click **Làm mới**, and check the persistent history. Failed/unauthorized attempts continue to be handled by security controls.

## Notes

- Rebuilding the image is required because both backend and admin UI changed. Restarting containers without `--build` does not apply these changes.
- The audit writer uses a bounded asynchronous queue. Under overload or PostgreSQL failure, errors are printed to stderr; it is not a tamper-proof, guaranteed-delivery ledger.
- TCP protocol messages remain in `nhat_ky` as before, separately from the business audit records.
- Docker shows internal container IPs (e.g. `172.19.0.1`) when traffic goes through a proxy; this is not necessarily the user's public IP.
