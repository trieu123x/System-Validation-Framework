-- Thông báo của công ty tới chi nhánh, có phản hồi.
-- Được schema.sql và migrate_thong_bao.sql gọi; chạy lại được.
--   TIN          tin thường, chỉ ghi nhận đã xem
--   HOI_NHU_CAU  hỏi chi nhánh sắp chạm ngưỡng có cần hàng không → CAN_HANG tạo YC
--   SP_MOI       giới thiệu sản phẩm mới → MUON_NHAP tạo dòng kho chi nhánh và YC

CREATE TABLE IF NOT EXISTS thong_bao (
    id                BIGSERIAL    PRIMARY KEY,
    loai              VARCHAR(12)  NOT NULL CHECK (loai IN ('TIN', 'HOI_NHU_CAU', 'SP_MOI')),
    tieu_de           VARCHAR(150) NOT NULL,
    noi_dung          TEXT         NOT NULL DEFAULT '',
    ma_sp             VARCHAR(10)  REFERENCES san_pham(ma_sp) ON DELETE SET NULL,
    so_luong_de_xuat  INTEGER      CHECK (so_luong_de_xuat > 0),
    tao_luc           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mỗi chi nhánh nhận một dòng. de_xuat riêng từng CN (vd 2 × ngưỡng − tồn), so_luong là số CN trả lời.
CREATE TABLE IF NOT EXISTS thong_bao_cn (
    id_tb        BIGINT       NOT NULL REFERENCES thong_bao(id) ON DELETE CASCADE,
    ma_cn        VARCHAR(10)  NOT NULL REFERENCES chi_nhanh(ma_cn),
    trang_thai   VARCHAR(10)  NOT NULL DEFAULT 'DA_GUI'
        CHECK (trang_thai IN ('DA_GUI', 'DA_XEM', 'CAN_HANG', 'KHONG_CAN', 'MUON_NHAP', 'BO_QUA')),
    de_xuat      INTEGER      CHECK (de_xuat > 0),
    so_luong     INTEGER      CHECK (so_luong > 0),
    ma_yc        INTEGER      REFERENCES yeu_cau(ma_yc) ON DELETE SET NULL,
    xem_luc      TIMESTAMP(3),
    tra_loi_luc  TIMESTAMP(3),
    PRIMARY KEY (id_tb, ma_cn)
);

CREATE INDEX IF NOT EXISTS idx_thong_bao_cn_ma_cn ON thong_bao_cn (ma_cn, id_tb);
