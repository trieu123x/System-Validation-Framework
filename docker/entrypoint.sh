#!/bin/sh
# Chọn tiến trình theo lệnh đầu tiên; tham số còn lại (key=value) ghi đè cấu hình như khi chạy .bat.
set -e
cd /app

case "$1" in
  server)
    shift
    # Giá trị riêng của container lấy từ biến môi trường, không nằm trong image
    {
      echo "db.url=${DB_URL:-jdbc:postgresql://db:5432/phan_phoi_hang}"
      echo "db.user=${DB_USER:-postgres}"
      echo "db.password=${DB_PASSWORD:-}"
      # trong container phải nghe mọi địa chỉ; compose chỉ mở cổng 8080 ra 127.0.0.1 của máy host
      echo "admin.http.host=0.0.0.0"
      echo "open.browser=false"
      echo "scraping.mode=${SCRAPING_MODE:-block}"
      if [ -n "${ADMIN_ORIGIN:-}" ]; then echo "security.allowed.origins=${ADMIN_ORIGIN}"; fi
      if [ -n "${ADMIN_PASSWORD_HASH:-}" ]; then
        echo "admin.password.hash=${ADMIN_PASSWORD_HASH}"
      fi
    } > config/server.local.properties
    exec java $JAVA_OPTS -jar server.jar "$@"
    ;;
  client)
    shift
    exec java $JAVA_OPTS -jar client.jar http.host=0.0.0.0 open.browser=false "server=${SERVER:-server:5000}" "scraping.mode=${SCRAPING_MODE:-block}" "security.allowed.origins=http://localhost:3000,http://localhost:3001${CLIENT_ORIGIN:+,$CLIENT_ORIGIN}" "$@"
    ;;
  loadsim)
    shift
    exec java $JAVA_OPTS -jar loadsim.jar "server=${SERVER:-server:5000}" "scraping.mode=${SCRAPING_MODE:-block}" "security.allowed.origins=http://localhost:3000,http://localhost:3001${CLIENT_ORIGIN:+,$CLIENT_ORIGIN}" "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
