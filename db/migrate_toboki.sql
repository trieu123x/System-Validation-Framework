-- Chuyển CSDL đang có (hàng tạp hoá SP01..) sang hàng Toboki TB01..TB28, danh mục, giá, công nợ, sự kiện an ninh.
-- CẢNH BÁO: XOÁ toàn bộ giao dịch (yêu cầu, phiếu nhập/xuất, bán hàng, điều chuyển, nhật ký, tin chờ, công nợ),
-- kho tổng, kho chi nhánh và mặt hàng cũ. Giữ tài khoản chi nhánh (kể cả SIM) và sự kiện an ninh.
-- Chạy bằng scripts\migrate-db.bat. Chạy lại được.

BEGIN;

ALTER TABLE chi_nhanh ADD COLUMN IF NOT EXISTS gia_lap BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chi_nhanh ADD COLUMN IF NOT EXISTS han_muc_no NUMERIC(15,0) NOT NULL DEFAULT 200000000 CHECK (han_muc_no >= 0);

CREATE TABLE IF NOT EXISTS danh_muc (
    ma_dm  VARCHAR(10)  PRIMARY KEY,
    ten    VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS nha_cung_cap (
    ma_ncc      VARCHAR(10)  PRIMARY KEY,
    ten         VARCHAR(150) NOT NULL,
    mst         VARCHAR(20),
    dia_chi     VARCHAR(255),
    dien_thoai  VARCHAR(20)
);

\ir dieu_chuyen.sql

CREATE TABLE IF NOT EXISTS cong_no_cn (
    id         BIGSERIAL     PRIMARY KEY,
    ma_cn      VARCHAR(10)   NOT NULL REFERENCES chi_nhanh(ma_cn),
    loai       VARCHAR(8)    NOT NULL CHECK (loai IN ('XUAT', 'THU', 'DC_NHAN', 'DC_GIAO')),
    so_tien    NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    ma_yc      INTEGER       REFERENCES yeu_cau(ma_yc),
    ma_dc      INTEGER       REFERENCES dieu_chuyen(ma_dc),
    ghi_chu    VARCHAR(255),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cong_no_yc ON cong_no_cn (loai, ma_yc) WHERE ma_yc IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cong_no_dc ON cong_no_cn (loai, ma_dc) WHERE ma_dc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cong_no_cn ON cong_no_cn (ma_cn, thoi_gian);

CREATE TABLE IF NOT EXISTS thanh_toan_ncc (
    id         BIGSERIAL     PRIMARY KEY,
    ma_ncc     VARCHAR(10)   NOT NULL REFERENCES nha_cung_cap(ma_ncc),
    so_tien    NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    ghi_chu    VARCHAR(255),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS su_kien_bao_mat (
    id         BIGSERIAL    PRIMARY KEY,
    thoi_gian  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nguon      VARCHAR(6)   NOT NULL CHECK (nguon IN ('SERVER', 'CLIENT', 'ADMIN')),
    loai       VARCHAR(30)  NOT NULL,
    muc        VARCHAR(6)   NOT NULL CHECK (muc IN ('LOW', 'MEDIUM', 'HIGH')),
    ip         VARCHAR(45),
    ma_cn      VARCHAR(10),
    chi_tiet   TEXT,
    hanh_dong  VARCHAR(12)  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_su_kien_thoi_gian ON su_kien_bao_mat (thoi_gian);

-- Xoá giao dịch và hàng cũ. Không RESTART IDENTITY: client.jar lọc tin trùng theo mã YC.
TRUNCATE cong_no_cn, thanh_toan_ncc, dieu_chuyen, phieu_xuat, yeu_cau, phieu_nhap, ban_hang, nhat_ky, hang_doi_tin,
         kho_chi_nhanh, kho_tong, san_pham CASCADE;

-- Bảng đã rỗng nên thêm được cột NOT NULL không có mặc định
ALTER TABLE san_pham DROP COLUMN IF EXISTS gia;
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS model VARCHAR(30);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS ma_dm VARCHAR(10) NOT NULL REFERENCES danh_muc(ma_dm);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS gia_nhap NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_nhap >= 0);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS gia_xuat NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_xuat >= 0);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS gia_ban_le NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_ban_le >= 0);

ALTER TABLE phieu_nhap DROP COLUMN IF EXISTS nha_cung_cap;
ALTER TABLE phieu_nhap ADD COLUMN IF NOT EXISTS ma_ncc VARCHAR(10) NOT NULL REFERENCES nha_cung_cap(ma_ncc);
ALTER TABLE phieu_nhap ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15,0) NOT NULL CHECK (don_gia >= 0);

ALTER TABLE phieu_xuat ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (don_gia >= 0);

COMMIT;

\ir seed.sql
\ir seed_loadsim.sql
\ir migrate_thong_bao.sql
