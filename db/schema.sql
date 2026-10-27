-- Schema CSDL cho hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động
-- Theo SRS mục 6 (10 bảng), thêm danh mục, nhà cung cấp, công nợ, sự kiện an ninh.
-- Viết cho PostgreSQL; chạy trên database phan_phoi_hang. CSDL cũ thì dùng migrate_toboki.sql.

BEGIN;

-- Chi nhánh do admin tạo sẵn, không có chức năng đăng ký (SRS 2.5)
CREATE TABLE chi_nhanh (
    ma_cn          VARCHAR(10)  PRIMARY KEY,
    ten            VARCHAR(100) NOT NULL,
    email          VARCHAR(254),
    dia_chi        VARCHAR(255),
    mat_khau_hash  VARCHAR(128) NOT NULL,
    salt           VARCHAR(64)  NOT NULL,
    -- chi nhánh ảo của trình giả lập tải: không nhận broadcast, không làm nguồn điều chuyển
    gia_lap        BOOLEAN      NOT NULL DEFAULT FALSE,
    -- vượt hạn mức nợ chỉ cảnh báo, không chặn gửi hàng
    han_muc_no     NUMERIC(15,0) NOT NULL DEFAULT 200000000 CHECK (han_muc_no >= 0)
);

CREATE TABLE danh_muc (
    ma_dm  VARCHAR(10)  PRIMARY KEY,
    ten    VARCHAR(100) NOT NULL UNIQUE
);

-- Giá tính bằng đồng (số nguyên): nhập từ NCC, xuất cho chi nhánh, bán lẻ gợi ý
CREATE TABLE san_pham (
    ma_sp       VARCHAR(10)   PRIMARY KEY,
    ten         VARCHAR(150)  NOT NULL,
    don_vi      VARCHAR(20)   NOT NULL,
    model       VARCHAR(30),
    ma_dm       VARCHAR(10)   NOT NULL REFERENCES danh_muc(ma_dm),
    gia_nhap    NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_nhap >= 0),
    gia_xuat    NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_xuat >= 0),
    gia_ban_le  NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (gia_ban_le >= 0),
    -- ảnh tượng trưng trên Cloudinary (scripts/images/upload_images.py); NULL = hiện icon danh mục
    anh_url     VARCHAR(255)
);

CREATE TABLE nha_cung_cap (
    ma_ncc      VARCHAR(10)  PRIMARY KEY,
    ten         VARCHAR(150) NOT NULL,
    mst         VARCHAR(20),
    dia_chi     VARCHAR(255),
    dien_thoai  VARCHAR(20)
);

-- Ràng buộc chống âm ở mức DB
CREATE TABLE kho_tong (
    ma_sp     VARCHAR(10) PRIMARY KEY REFERENCES san_pham(ma_sp),
    so_luong  INTEGER     NOT NULL DEFAULT 0 CHECK (so_luong >= 0)
);

CREATE TABLE kho_chi_nhanh (
    ma_cn             VARCHAR(10) NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp             VARCHAR(10) NOT NULL REFERENCES san_pham(ma_sp),
    so_luong          INTEGER     NOT NULL DEFAULT 0 CHECK (so_luong >= 0),
    nguong_toi_thieu  INTEGER     NOT NULL DEFAULT 0 CHECK (nguong_toi_thieu >= 0),
    PRIMARY KEY (ma_cn, ma_sp)
);

-- Vòng đời yêu cầu (SRS 6.2): CHO -> DA_DE_XUAT -> DA_GIAO -> HOAN_TAT,
-- nhánh TU_CHOI và THIEU_HANG
CREATE TABLE yeu_cau (
    ma_yc             SERIAL       PRIMARY KEY,
    ma_cn             VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp             VARCHAR(10)  NOT NULL REFERENCES san_pham(ma_sp),
    so_luong_de_xuat  INTEGER      CHECK (so_luong_de_xuat > 0),
    so_luong_chot     INTEGER      CHECK (so_luong_chot > 0),
    so_luong_giao     INTEGER      CHECK (so_luong_giao > 0),
    so_luong_nhan     INTEGER      CHECK (so_luong_nhan >= 0),
    -- số chi nhánh xin khi trả lời thông báo (Cần hàng / Muốn nhập); NULL = YC từ LOW_STOCK
    so_luong_xin      INTEGER      CHECK (so_luong_xin > 0),
    trang_thai        VARCHAR(12)  NOT NULL DEFAULT 'CHO'
        CHECK (trang_thai IN ('CHO', 'DA_DE_XUAT', 'DA_GIAO', 'HOAN_TAT', 'TU_CHOI', 'THIEU_HANG')),
    tao_luc           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cap_nhat_luc      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FR-14: tối đa một yêu cầu chưa đóng cho mỗi cặp (CN, SP)
CREATE UNIQUE INDEX uq_yeu_cau_dang_mo
    ON yeu_cau (ma_cn, ma_sp)
    WHERE trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI');

CREATE INDEX idx_yeu_cau_trang_thai ON yeu_cau (trang_thai);

-- Log mọi tin nhắn, thời điểm tới mili-giây. ma_cn NULL khi tin đến trước LOGIN.
CREATE TABLE nhat_ky (
    id         BIGSERIAL    PRIMARY KEY,
    ma_cn      VARCHAR(10)  REFERENCES chi_nhanh(ma_cn),
    chieu      VARCHAR(3)   NOT NULL CHECK (chieu IN ('IN', 'OUT')),
    lenh       VARCHAR(30)  NOT NULL,
    noi_dung   TEXT,
    thoi_gian  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nhat_ky_cn_thoi_gian ON nhat_ky (ma_cn, thoi_gian);


-- Operational audit (TCP branch operations + Admin HTTP API).
-- Safe for existing volumes; server also creates this table automatically on startup.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    thoi_gian TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nguon VARCHAR(12) NOT NULL,
    actor VARCHAR(80) NOT NULL,
    hanh_dong VARCHAR(80) NOT NULL,
    chi_tiet VARCHAR(500) NOT NULL,
    ket_qua VARCHAR(20) NOT NULL,
    ip VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(thoi_gian DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_time ON audit_log(actor, thoi_gian DESC);

-- UNIQUE ma_yc chặn xuất hai lần cho một YC (FR-18, TC-12).
-- don_gia = san_pham.gia_xuat lúc gửi hàng; đổi giá sau đó không làm đổi nợ của YC này.
CREATE TABLE phieu_xuat (
    ma_px      SERIAL        PRIMARY KEY,
    ma_yc      INTEGER       NOT NULL UNIQUE REFERENCES yeu_cau(ma_yc),
    ma_cn      VARCHAR(10)   NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp      VARCHAR(10)   NOT NULL REFERENCES san_pham(ma_sp),
    so_luong   INTEGER       NOT NULL CHECK (so_luong > 0),
    don_gia    NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (don_gia >= 0),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hàng vào kho tổng (FR-08); công ty nợ NCC Σ so_luong × don_gia
CREATE TABLE phieu_nhap (
    ma_pn      SERIAL        PRIMARY KEY,
    ma_sp      VARCHAR(10)   NOT NULL REFERENCES san_pham(ma_sp),
    so_luong   INTEGER       NOT NULL CHECK (so_luong > 0),
    ma_ncc     VARCHAR(10)   NOT NULL REFERENCES nha_cung_cap(ma_ncc),
    don_gia    NUMERIC(15,0) NOT NULL CHECK (don_gia >= 0),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Nguồn cho dự báo và biểu đồ
CREATE TABLE ban_hang (
    id         BIGSERIAL    PRIMARY KEY,
    ma_cn      VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp      VARCHAR(10)  NOT NULL REFERENCES san_pham(ma_sp),
    so_luong   INTEGER      NOT NULL CHECK (so_luong > 0),
    thoi_gian  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ban_hang_cn_sp_thoi_gian ON ban_hang (ma_cn, ma_sp, thoi_gian);

-- Tin chờ gửi cho CN offline, gửi lại sau LOGIN_OK (FR-21)
CREATE TABLE hang_doi_tin (
    id        BIGSERIAL    PRIMARY KEY,
    ma_cn     VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    noi_dung  TEXT         NOT NULL,
    tao_luc   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    da_gui    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_hang_doi_tin_chua_gui ON hang_doi_tin (ma_cn, tao_luc) WHERE NOT da_gui;

\ir dieu_chuyen.sql

-- Sổ công nợ chi nhánh: còn nợ = Σ(XUAT + DC_NHAN) − Σ(THU + DC_GIAO); dấu suy ra từ loai
CREATE TABLE cong_no_cn (
    id         BIGSERIAL     PRIMARY KEY,
    ma_cn      VARCHAR(10)   NOT NULL REFERENCES chi_nhanh(ma_cn),
    loai       VARCHAR(8)    NOT NULL CHECK (loai IN ('XUAT', 'THU', 'DC_NHAN', 'DC_GIAO')),
    so_tien    NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    ma_yc      INTEGER       REFERENCES yeu_cau(ma_yc),
    ma_dc      INTEGER       REFERENCES dieu_chuyen(ma_dc),
    ghi_chu    VARCHAR(255),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RECEIVED/ACCEPT gửi lặp không ghi nợ hai lần
CREATE UNIQUE INDEX uq_cong_no_yc ON cong_no_cn (loai, ma_yc) WHERE ma_yc IS NOT NULL;
CREATE UNIQUE INDEX uq_cong_no_dc ON cong_no_cn (loai, ma_dc) WHERE ma_dc IS NOT NULL;
CREATE INDEX idx_cong_no_cn ON cong_no_cn (ma_cn, thoi_gian);

-- Phiếu chi trả nhà cung cấp
CREATE TABLE thanh_toan_ncc (
    id         BIGSERIAL     PRIMARY KEY,
    ma_ncc     VARCHAR(10)   NOT NULL REFERENCES nha_cung_cap(ma_ncc),
    so_tien    NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
    ghi_chu    VARCHAR(255),
    thoi_gian  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sự kiện giám sát an ninh. ma_cn không FK: có thể là mã đoán bừa khi dò mật khẩu.
-- hanh_dong: GHI_NHAN | CHAN_IP | NGAT | GIOI_HAN | KHOA_TK
CREATE TABLE su_kien_bao_mat (
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

CREATE INDEX idx_su_kien_thoi_gian ON su_kien_bao_mat (thoi_gian);

\ir thong_bao.sql

COMMIT;

-- PostgreSQL, additive/idempotent; no DROP and no seed reset.
BEGIN;
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS event_key VARCHAR(36);
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS review VARCHAR(20);
ALTER TABLE su_kien_bao_mat ADD COLUMN IF NOT EXISTS review_reason VARCHAR(500);
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_event_key ON su_kien_bao_mat(event_key);
CREATE INDEX IF NOT EXISTS idx_security_type_time ON su_kien_bao_mat(loai, thoi_gian);
CREATE TABLE IF NOT EXISTS security_scraping_blocks (
    subject VARCHAR(160) PRIMARY KEY,
    expires_at BIGINT NOT NULL,
    reason VARCHAR(500) NOT NULL
);
CREATE TABLE IF NOT EXISTS security_email_delivery (
    id BIGSERIAL PRIMARY KEY,
    event_key VARCHAR(36) NOT NULL,
    recipient VARCHAR(320) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_key, recipient)
);
CREATE INDEX IF NOT EXISTS idx_security_email_time ON security_email_delivery(updated_at);
COMMIT;
