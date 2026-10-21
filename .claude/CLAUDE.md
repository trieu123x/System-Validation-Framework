# Goods distribution system (BTL Lập trình mạng)

Company server + 10–20 branches (up to 1000 simulated) over a custom line-based TCP protocol, with automatic low-stock alerts. Group coursework, due 31/10/2026 (`Submission.md`); assignment in `Instruction.md`, `Topics.md`.

## Stack

- Java 17, Maven multi-module: `common`, `server`, `client`, `loadsim`. Plain `java.net`/`java.nio` sockets + UDP discovery; no HTTP/RMI/messaging lib between branch and server.
- PostgreSQL via JDBC + HikariCP · Gson (local JSON API) · JUnit 5.
- `ui/`: Next.js 15, React 19, TypeScript 5.9, static export to `ui/out`, served by the jars (admin :8080, branch :8081+).
- Docker Compose alternative: `docker compose up --build -d`.

## Commands

Run from repo root in Bash. JDK 17 + Maven are portable in `tools/` (gitignored; no admin rights here), so prefix Maven with `source tools/env.sh &&`.

- Install: `npm --prefix ui install` (Maven fetches deps on first build)
- Build: `source tools/env.sh && mvn -q package` (jars in `*/target/`) and `npm --prefix ui run build` (→ `ui/out`). Everything: `scripts\build.bat`
- Test (all): `source tools/env.sh && mvn -q test` (65 unit tests, all in `common`)
- Test (one): `source tools/env.sh && mvn -q -pl common test -Dtest=ProtocolTest` or `-Dtest='NetUtilTest#splitterFlagsTooLongAndRecovers'`
- Typecheck: `npm --prefix ui run typecheck`
- Run: `scripts\run-server.bat`, `scripts\run-client.bat [http.port=8082]`; UI dev against running Java: `npm --prefix ui run dev:admin` / `dev:branch`
- No linter or formatter is configured.
- Integration tests TC-01..12 (README §6) are manual. Experiments: `scripts\run-experiments.bat`, `scripts\run-loadsim.bat`, `scripts\sim-log.bat`.

## Layout

- README §2 maps folders. Protocol: `common/.../Protocol.java`, `Command`, `ErrorCode`.
- Entry points: `server/.../ServerMain.java`, `client/.../ClientMain.java`, `loadsim/.../Experiments.java`.
- DB scripts in `db/` (`schema.sql`, `dieu_chuyen.sql`, `seed.sql`, `seed_loadsim.sql` = SIM001..SIM1000, `seed_demo.sql`); setup with `scripts\setup-db.bat`.
- Config: `config/*.properties`, overridden by `config/*.local.properties` (gitignored) then `key=value` CLI args.
- Generated, don't edit by hand: `*/target/`, `ui/out/`, `ui/.next/`, `experiments/results/`, `report/*.docx` (regenerate with `report/source/build-report.js`).

## Conventions

- Only the server touches the DB. All network I/O stays in Java; the UI only calls the local HTTP API (`ui/lib/api.ts`) and SSE.
- Every improvement keeps a baseline flag in `ServerSettings`/`config/*.properties` (`io.mode`, `accept.strategy`, `delivery`, `write.mode`, `reconnect.strategy`...) so experiments E1–E7 can compare them.
- Protocol change → update README §5 "Định dạng tin" and remind me to update SRS §4 (team rule).
- Central stock is decremented with `UPDATE ... WHERE so_luong >= ?` in a transaction; lock order is request (YC) before transfer to avoid deadlocks.
- Passwords are stored as `hex(SHA-256(salt + password))`.
- The SRS says MySQL + Swing; we chose PostgreSQL + Next.js. Don't propose going back.

## Gotchas

- A server/clients may already be running on 5000/5001/8080/8081/8082 (often another Claude session). Check `tasklist //FI "IMAGENAME eq java.exe"` before `mvn package` (Windows locks running jars) or killing java. For your own runs use other ports, e.g. `tcp.port=5100 admin.http.port=8180`.
- Local DB: PostgreSQL 127.0.0.1:5432, db `phan_phoi_hang`, user `postgres`; password lives in `config/server.local.properties`, never commit it. Docker DB is on 5433. Compose env vars: `DB_PASSWORD`, `ADMIN_PASSWORD_HASH`, `SEED_DEMO`, `*_PORT` (see `.env.example`).
- `max.clients` defaults to 100; load tests need e.g. `max.clients=1100`.
- E6/E7 and `sim-log --real` write hundreds of thousands of `nhat_ky` rows for SIM branches; clean them up afterwards.
- After `build-report.js` the docx TOC is empty; refresh it through Word COM before exporting the PDF.
- `*.sh` and `Dockerfile` must stay LF (`.gitattributes`).
- Demo logins: admin/admin123; CN01..CN03 / 123456. `/api/experiment/*` needs no login (localhost only).

## How we work

- Talk to me in Vietnamese. Identifiers in English; comments, README, docs and commit messages in Vietnamese, matching the existing codebase.
- Big or unclear work: `/spec` first, then `/feature <spec>`. Bugs: `/fix`. Before committing: `/ship`.
- If the diff fits in one sentence, skip the plan and just do it.
- Prove that work is done with evidence: the command you ran and its result. Never say "should work".
- Use the `test-runner` subagent for test or build runs with long output, `reviewer` before committing, `security-reviewer` when touching auth, input parsing, SQL, shell or network code, and `docs-researcher` for library questions.
- Follow the patterns already in the codebase. Don't add a dependency, change public APIs or touch unrelated code without asking.
- When compacting, keep the list of modified files, the active spec path, the test commands and any failing tests.
