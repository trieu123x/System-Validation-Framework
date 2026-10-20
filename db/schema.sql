-- Schema CSDL cho hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động
-- Theo SRS mục 6 (10 bảng). Viết cho PostgreSQL; chạy trên database phan_phoi_hang.

BEGIN;

-- Chi nhánh do admin tạo sẵn, không có chức năng đăng ký (SRS 2.5)
CREATE TABLE chi_nhanh (
    ma_cn          VARCHAR(10)  PRIMARY KEY,
    ten            VARCHAR(100) NOT NULL,
    dia_chi        VARCHAR(255),
    mat_khau_hash  VARCHAR(128) NOT NULL,
    salt           VARCHAR(64)  NOT NULL,
    -- chi nhánh ảo của trình giả lập tải: không nhận broadcast, không làm nguồn điều chuyển
    gia_lap        BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE san_pham (
    ma_sp   VARCHAR(10)   PRIMARY KEY,
    ten     VARCHAR(150)  NOT NULL,
    don_vi  VARCHAR(20)   NOT NULL,
    gia     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gia >= 0)
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

-- UNIQUE ma_yc chặn xuất hai lần cho một YC (FR-18, TC-12)
CREATE TABLE phieu_xuat (
    ma_px      SERIAL       PRIMARY KEY,
    ma_yc      INTEGER      NOT NULL UNIQUE REFERENCES yeu_cau(ma_yc),
    ma_cn      VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp      VARCHAR(10)  NOT NULL REFERENCES san_pham(ma_sp),
    so_luong   INTEGER      NOT NULL CHECK (so_luong > 0),
    thoi_gian  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hàng vào kho tổng (FR-08)
CREATE TABLE phieu_nhap (
    ma_pn         SERIAL       PRIMARY KEY,
    ma_sp         VARCHAR(10)  NOT NULL REFERENCES san_pham(ma_sp),
    so_luong      INTEGER      NOT NULL CHECK (so_luong > 0),
    nha_cung_cap  VARCHAR(150),
    thoi_gian     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
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

COMMIT;
