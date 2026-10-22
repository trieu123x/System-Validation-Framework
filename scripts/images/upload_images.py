"""Ảnh tượng trưng cho hàng hoá: Wikimedia Commons -> nén bằng Pillow -> Cloudinary -> db/seed_images.sql.

Dùng (chạy từ thư mục gốc repo):
    python scripts/images/upload_images.py --list "pressure washer"   # xem ảnh ứng viên để chọn
    python scripts/images/upload_images.py --dry-run                  # tải + nén, không upload
    python scripts/images/upload_images.py                            # tải + nén + upload + sinh SQL
    python scripts/images/upload_images.py --only TB01,TB02

Khoá Cloudinary đọc từ config/cloudinary.local.properties (cloud.name, api.key, api.secret), không commit.
"""

import argparse
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SOURCES = HERE / "sources.json"
CREDITS = HERE / "credits.json"
OUT_SQL = ROOT / "db" / "seed_images.sql"
CACHE = ROOT / "scripts" / "images" / "cache"
CONFIG = ROOT / "config" / "cloudinary.local.properties"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia yêu cầu User-Agent có thông tin liên hệ
USER_AGENT = "toboki-btl-laptrinhmang/1.0 (student coursework; python urllib)"
MAX_SIDE = 800
WEBP_QUALITY = 75
FREE_LICENSES = ("CC0", "CC BY", "Public domain", "PD", "Attribution")


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            # Commons giới hạn tần suất (429): chờ tăng dần rồi thử lại
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (attempt + 1))


def commons_search(query, limit=10):
    """Tìm ảnh (bitmap) trên Commons, trả danh sách {title, thumb, license, artist, page}."""
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
        "gsrlimit": str(limit), "gsrsearch": query + " filetype:bitmap",
        "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": "1200",
        "iiextmetadatafilter": "LicenseShortName|Artist",
    }
    data = json.loads(http_get(COMMONS_API + "?" + urllib.parse.urlencode(params)))
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    return [info(p) for p in pages if p.get("imageinfo")]


def commons_file(title):
    params = {
        "action": "query", "format": "json", "titles": title,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": "1200",
        "iiextmetadatafilter": "LicenseShortName|Artist",
    }
    data = json.loads(http_get(COMMONS_API + "?" + urllib.parse.urlencode(params)))
    page = next(iter(data["query"]["pages"].values()))
    if not page.get("imageinfo"):
        raise RuntimeError("Khong tim thay file Commons: " + title)
    return info(page)


def info(page):
    ii = page["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    artist = re.sub(r"<[^>]+>", "", html.unescape(meta.get("Artist", {}).get("value", ""))).strip()
    return {
        "title": page["title"],
        "thumb": ii.get("thumburl") or ii["url"],
        "license": meta.get("LicenseShortName", {}).get("value", ""),
        "artist": artist or "không rõ",
        "page": ii.get("descriptionurl", ""),
        "size": f'{ii.get("width")}x{ii.get("height")}',
    }


def compress(raw):
    """Xoay theo EXIF, thu cạnh dài về MAX_SIDE, bỏ metadata, xuất WebP."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    # ảnh gốc vốn nhỏ: hạ dần chất lượng tới khi WebP nhỏ hơn bản gốc (thấp nhất q=50)
    for quality in range(WEBP_QUALITY, 49, -5):
        out = io.BytesIO()
        img.save(out, "WEBP", quality=quality, method=6)
        if out.tell() < len(raw):
            break
    return out.getvalue(), img.size


def load_config():
    if not CONFIG.exists():
        sys.exit(f"Thieu {CONFIG} (cloud.name, api.key, api.secret)")
    cfg = {}
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip()
    for k in ("cloud.name", "api.key", "api.secret"):
        if not cfg.get(k):
            sys.exit(f"{CONFIG} thieu {k}")
    return cfg


def upload(cfg, public_id, data):
    """Upload có chữ ký: signature = sha1(tham số sắp xếp theo tên nối '&' + api_secret)."""
    params = {"invalidate": "true", "overwrite": "true", "public_id": public_id, "timestamp": str(int(time.time()))}
    to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params)) + cfg["api.secret"]
    params["signature"] = hashlib.sha1(to_sign.encode()).hexdigest()
    params["api_key"] = cfg["api.key"]

    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    for k, v in params.items():
        body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{public_id.split("/")[-1]}.webp"\r\n'
               "Content-Type: image/webp\r\n\r\n".encode())
    body.write(data)
    body.write(f"\r\n--{boundary}--\r\n".encode())

    url = f'https://api.cloudinary.com/v1_1/{cfg["cloud.name"]}/image/upload'
    req = urllib.request.Request(url, data=body.getvalue(), method="POST", headers={
        "Content-Type": "multipart/form-data; boundary=" + boundary, "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Cloudinary {e.code}: {e.read().decode(errors='replace')[:300]}") from None


def pick(src):
    if src.get("file"):
        return commons_file(src["file"])
    found = [c for c in commons_search(src["query"]) if c["license"].startswith(FREE_LICENSES)]
    if not found:
        raise RuntimeError("Khong co anh giay phep tu do cho: " + src["query"])
    return found[min(src.get("pick", 0), len(found) - 1)]


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", metavar="QUERY", help="in ảnh ứng viên trên Commons rồi thoát")
    ap.add_argument("--dry-run", action="store_true", help="chỉ tải và nén, không upload, không sinh SQL")
    ap.add_argument("--only", help="danh sách mã hàng, cách nhau dấu phẩy")
    args = ap.parse_args()

    if args.list:
        for i, c in enumerate(commons_search(args.list, 15)):
            print(f'{i:2} {c["license"]:<14} {c["size"]:<11} {c["title"]}')
        return

    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    cfg = None if args.dry_run else load_config()
    credits = json.loads(CREDITS.read_text(encoding="utf-8")) if CREDITS.exists() else {}
    CACHE.mkdir(parents=True, exist_ok=True)
    total_in = total_out = 0

    for ma_sp, src in sources.items():
        if only and ma_sp not in only:
            continue
        c = pick(src)
        cached = CACHE / (hashlib.sha1(c["thumb"].encode()).hexdigest() + ".bin")
        raw = cached.read_bytes() if cached.exists() else http_get(c["thumb"])
        cached.write_bytes(raw)
        data, size = compress(raw)
        total_in += len(raw)
        total_out += len(data)
        line = f'{ma_sp}: {len(raw) / 1024:7.1f} KB -> {len(data) / 1024:6.1f} KB {size[0]}x{size[1]}  {c["title"]}'
        if args.dry_run:
            print(line)
            continue
        res = upload(cfg, "toboki/" + ma_sp, data)
        credits[ma_sp] = {"file": c["title"], "artist": c["artist"], "license": c["license"], "page": c["page"],
                          "url": res["secure_url"], "bytes": res.get("bytes", len(data))}
        print(line, "->", res["secure_url"])
        time.sleep(0.3)

    print(f"Tong: {total_in / 1024:.0f} KB -> {total_out / 1024:.0f} KB"
          + (f" ({100 - 100 * total_out / total_in:.0f}% nho hon)" if total_in else ""))
    if args.dry_run:
        return

    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["-- Sinh bởi scripts/images/upload_images.py, đừng sửa tay. Ảnh tượng trưng từ Wikimedia Commons,",
             "-- tác giả và giấy phép ở scripts/images/credits.json. Chạy sau seed.sql (và seed_demo.sql).", "",
             "BEGIN;"]
    for ma_sp in sorted(credits):
        lines.append(f"UPDATE san_pham SET anh_url = {sql_str(credits[ma_sp]['url'])} WHERE ma_sp = {sql_str(ma_sp)};")
    lines.append("COMMIT;")
    OUT_SQL.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Da ghi", OUT_SQL.relative_to(ROOT), "va", CREDITS.relative_to(ROOT))


if __name__ == "__main__":
    main()
