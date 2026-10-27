# TCP 5000 through Tailscale (no FRP)

## Architecture

- Windows 11 Server runs the **main** `docker-compose.yml` stack (`phanphoi`). PostgreSQL stays in its existing named volume.
- Docker publishes Java TCP `5000` only on `127.0.0.1:SERVER_TCP_PORT` (default `5000`) on Windows; this is **not** an Internet-facing socket.
- `tailscale serve --bg --tcp=5000 tcp://127.0.0.1:5000` exposes raw TCP on the Windows node's **tailnet IP** to *authorized tailnet members*, without FRP/AWS/router port forwarding.
- The existing **public** Admin Funnel `443` and shared Client Web Funnel `8443` remain unchanged; the built-in Docker Client Gateway continues to use `server:5000` on the Docker network.
- A standalone Ubuntu Java Client may connect to Windows Server `100.110.32.73:5000`. This is the IP reported in the working test; run `tailscale ip -4` on Windows to verify if it changes.
- DERP relay (for example `DERP(sin)`) is normal under restrictive NAT; it does not prevent TCP connectivity, but can add latency.

## Windows Server setup

From the project directory:

```bat
rem Full deployment: builds Docker, applies existing migrations, configures public web Funnel and PRIVATE tailnet TCP.
deploy.bat

rem Check/reapply TCP forwarding only, no Docker rebuild:
test-tailnet-tcp.bat

rem Display Tailscale private TCP routes and both web Funnel routes:
tailscale serve status
tailscale funnel status

rem Find Windows Server's tailnet IPv4:
tailscale ip -4
```

If you change `SERVER_TCP_PORT` in `.env`, rerun `deploy.bat`. The Tailnet-facing listener stays on TCP 5000, while `tailscale-tcp.bat` forwards to `127.0.0.1:<SERVER_TCP_PORT>`.

**Do not run the older isolated `svf-test5000` Compose stack simultaneously**. If that separate stack is still running, stop it intentionally, without removing database volumes, before trying to bind host port 5000. The cleanup script only removes legacy project files, not Docker containers or volumes.

Do **not** run `tailscale serve reset`, `tailscale funnel reset`, or `docker compose down -v`: these can erase other routes or database volumes.

## Ubuntu standalone Java Client

1. Install and log in to Tailscale using the account invited to the **same tailnet**:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale status
tailscale ping 100.110.32.73
```

2. Verify access to the raw TCP server:

```bash
sudo apt-get install -y netcat-openbsd
nc -vz -w 5 100.110.32.73 5000
```

3. Copy the built `client/target/client.jar`, `config/client.properties`, `ui/out/` and `scripts/run-client-tailnet.sh` to their matching locations on Ubuntu. Java 17+ is required. Run from the project root:

```bash
chmod +x scripts/run-client-tailnet.sh
./scripts/run-client-tailnet.sh 100.110.32.73 5000
# then open http://127.0.0.1:8081/branch/
```

Alternatively, `java -jar client/target/client.jar server=100.110.32.73:5000 open.browser=false` is enough when the JAR, config and UI already exist. Passing `server=...` overrides `server=auto` and avoids UDP discovery, which does not work across the tailnet.

Browser-only branches **do not need Tailscale**: they can keep using the existing public Client Funnel HTTPS URL, which talks to the internal Docker Client Gateway.

## Clean obsolete FRP scripts safely

```bat
cleanup-old-frp.bat
```

Enter `CLEAN` to remove ONLY `test-port-5000.bat`, `docker-compose.test5000.yml`, `scripts/test-port-5000.ps1`, `scripts/watch-test-port-5000.ps1`, if still present in the older checkout. The revised ZIP already omits them.

The cleanup **does not delete** `.env`, SMTP credentials, PostgreSQL data, Docker volumes, server/client code, external `D:\FRP`, or Tailscale Serve/Funnel configurations. The older `svf-test5000` Docker stack, if running, must be stopped separately.

## Security and connectivity notes

- Tailnet users should get the **minimum** access required in your Tailscale ACL/grants policy (TCP `5000` on the server only); an invitation is not a substitute for least privilege.
- Do not expose port 5000 via public Funnel or bind it to `0.0.0.0` on the Windows host.
- `tailscale ping` tests Tailscale connectivity; `nc`/`Test-NetConnection` verifies that TCP 5000 is actually accessible.
- In Serve TCP mode, the Java server may see the proxy's address rather than the original Ubuntu tailnet IP. Its TCP flood/ban accounting must **not** be treated as a reliable per-client public IP identity. Java application authentication remains necessary.
