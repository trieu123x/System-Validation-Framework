-- Nâng CSDL Toboki đang có: ảnh hàng hoá, thông báo có phản hồi, 3 mặt hàng mới TB29..TB31, CN01 Lĩnh Nam.
-- KHÔNG xoá dữ liệu. Chạy bằng scripts\migrate-thong-bao.bat. Chạy lại được.

BEGIN;

ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS anh_url VARCHAR(255);
ALTER TABLE yeu_cau ADD COLUMN IF NOT EXISTS so_luong_xin INTEGER CHECK (so_luong_xin > 0);

\ir thong_bao.sql

-- Chi nhánh thật của Toboki Việt Nam (MST 0109227055-001) ở phường Lĩnh Nam
UPDATE chi_nhanh SET ten = 'Chi nhánh Lĩnh Nam', dia_chi = 'Tổ 21, Lĩnh Nam, Hoàng Mai, Hà Nội'
WHERE ma_cn = 'CN01' AND ten = 'Chi nhánh Hà Nội';

COMMIT;

\ir seed_hang_moi.sql
\ir seed_images.sql
