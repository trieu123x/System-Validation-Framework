-- SRS 7.2-B: điều chuyển hàng giữa chi nhánh khi kho tổng thiếu.
-- Được schema.sql gọi; với DB đã tạo trước đó thì chạy riêng file này.

CREATE TABLE IF NOT EXISTS dieu_chuyen (
    ma_dc         SERIAL       PRIMARY KEY,
    ma_yc         INTEGER      NOT NULL REFERENCES yeu_cau(ma_yc),
    tu_cn         VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    den_cn        VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    ma_sp         VARCHAR(10)  NOT NULL REFERENCES san_pham(ma_sp),
    so_luong      INTEGER      NOT NULL CHECK (so_luong > 0),
    -- gia_xuat lúc hoàn tất: nợ đi theo hàng (DC_NHAN / DC_GIAO trong cong_no_cn)
    don_gia       NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (don_gia >= 0),
    -- HUY: yêu cầu gốc đã được xử lý theo đường khác trước khi CN nguồn trả lời
    trang_thai    VARCHAR(10)  NOT NULL DEFAULT 'CHO'
        CHECK (trang_thai IN ('CHO', 'HOAN_TAT', 'TU_CHOI', 'HUY')),
    tao_luc       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cap_nhat_luc  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (tu_cn <> den_cn)
);

ALTER TABLE dieu_chuyen ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15,0) NOT NULL DEFAULT 0 CHECK (don_gia >= 0);

-- Mỗi yêu cầu chỉ có một lời mời điều chuyển đang chờ
CREATE UNIQUE INDEX IF NOT EXISTS uq_dieu_chuyen_dang_cho
    ON dieu_chuyen (ma_yc) WHERE trang_thai = 'CHO';

CREATE INDEX IF NOT EXISTS idx_dieu_chuyen_tu_cn ON dieu_chuyen (tu_cn, trang_thai);
