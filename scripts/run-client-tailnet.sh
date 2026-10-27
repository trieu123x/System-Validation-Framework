#!/usr/bin/env bash
# Ubuntu: ./scripts/run-client-tailnet.sh [SERVER_TAILSCALE_IP] [TCP_PORT]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IP="${1:-${SVF_SERVER_TAILSCALE_IP:-100.110.32.73}}"
PORT="${2:-${SVF_TAILNET_TCP_PORT:-5000}}"
if [[ ! "$IP" =~ ^[0-9a-zA-Z_.:-]+$ || ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo '[ERROR] Invalid IP/hostname or TCP port.' >&2
  exit 1
fi
command -v java >/dev/null || { echo '[ERROR] Install Java 17+ first.' >&2; exit 1; }
if [[ ! -f "$ROOT/client/target/client.jar" ]]; then
  echo '[ERROR] Missing client/target/client.jar. Build first, or copy the built JAR from Windows.' >&2
  exit 1
fi
if [[ ! -d "$ROOT/ui/out" ]]; then
  echo '[WARNING] ui/out is absent. Copy the built UI to see the branch dashboard.' >&2
fi
cd "$ROOT"
echo "[TAILNET] Connecting Ubuntu Client to $IP:$PORT"
echo '[WEB] After startup: http://127.0.0.1:8081/branch/'
exec java -jar client/target/client.jar "server=$IP:$PORT" "open.browser=false"
