-- Chạy một lần khi volume CSDL còn trống (postgres image tự chạy /docker-entrypoint-initdb.d).
-- File SQL nằm ở /db (mount từ thư mục db/) để entrypoint không tự chạy lẻ dieu_chuyen.sql trước schema.sql.
\set ON_ERROR_STOP on
\i /db/schema.sql
\i /db/seed.sql
\i /db/seed_loadsim.sql

-- SEED_DEMO=1 (mặc định trong docker-compose.yml): 15 chi nhánh, 30 mặt hàng, ~60 ngày lịch sử
\getenv seed_demo SEED_DEMO
\if :{?seed_demo}
  \if :seed_demo
    \i /db/seed_demo.sql
  \endif
\endif
