"""Local staging checks. Python standard library only. Never prints credentials/cookies."""
import argparse
import getpass
import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request


def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(opener, base, path, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        response = opener.open(req, timeout=10)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        raw = response.read()
        return response.status, response.headers, json.loads(raw) if raw else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin", default="http://127.0.0.1:8080")
    parser.add_argument("--branch", default="http://127.0.0.1:8081")
    parser.add_argument("--exercise-rate-limit", action="store_true", help="Local staging + Mailpit only; emits security alerts")
    args = parser.parse_args()
    for base in (args.admin, args.branch):
        if urllib.parse.urlparse(base).hostname not in {"localhost", "127.0.0.1", "::1"}:
            parser.error("This smoke test only targets localhost staging.")
    unauth = client()
    status, _, state = request(unauth, args.branch, "/api/state")
    assert status == 200 and not state.get("maCn") and "inventory" not in state, "Unauthenticated branch data leak"
    assert request(unauth, args.branch, "/api/debt")[0] == 401
    assert request(unauth, args.branch, "/api/events")[0] == 401
    assert request(unauth, args.admin, "/api/products")[0] == 401
    assert request(unauth, args.admin, "/api/products", headers={"Origin": "https://untrusted.invalid"})[0] == 403
    print("PASS: anonymous data access denied; Origin guard active")
    if not args.exercise_rate_limit:
        return
    auth = client()
    user = input("Admin user [admin]: ").strip() or "admin"
    password = getpass.getpass("Admin password: ")
    assert request(auth, args.admin, "/api/auth/login", {"user": user, "matKhau": password})[0] == 200
    del password
    status, _, overview = request(auth, args.admin, "/api/security/overview")
    assert status == 200
    if overview["scraping"]["mode"] != "block":
        raise SystemExit("Set SCRAPING_MODE=block in local staging before rate-limit testing.")
    denied = False
    for _ in range(150):
        status, headers, _ = request(auth, args.admin, "/api/products")
        if status == 429:
            assert int(headers.get("Retry-After", "0")) > 0
            denied = True
            break
        assert status == 200, status
    assert denied, "No HTTP 429 within default quota. Check custom thresholds."
    assert request(auth, args.admin, "/api/security/scraping/blocks")[0] == 200
    print("PASS: HTTP 429 + Retry-After; block-management route remains accessible")
    print("Check Security events, email statuses and local Mailpit http://localhost:8025")


if __name__ == "__main__":
    main()
