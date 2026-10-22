-- Ba nhóm hàng toboki.vn có mà TB01..TB28 chưa có: máy bơm, bình phun, máy xoa vữa.
-- Dùng để demo thông báo "Sản phẩm mới": có hàng ở kho tổng, chi nhánh thật chưa có dòng kho.
-- Tên model và giá là GIẢ ĐỊNH (giá nhập = 70%, giá xuất = 85% giá bán lẻ như seed.sql).
-- Chạy sau seed.sql / seed_demo.sql; chạy lại được.

BEGIN;

INSERT INTO danh_muc (ma_dm, ten) VALUES
    ('DM08', 'Máy bơm'),
    ('DM09', 'Máy phun, bình phun'),
    ('DM10', 'Máy xoa vữa')
ON CONFLICT (ma_dm) DO UPDATE SET ten = EXCLUDED.ten;

CREATE TEMP TABLE hang_moi (
    ma_sp VARCHAR(10), ma_dm VARCHAR(10), ten VARCHAR(150), model VARCHAR(30), don_vi VARCHAR(20),
    gia_nhap NUMERIC(15,0), gia_xuat NUMERIC(15,0), gia_ban_le NUMERIC(15,0), ton_tong INTEGER, ma_ncc VARCHAR(10)
) ON COMMIT DROP;

INSERT INTO hang_moi VALUES
    ('TB29', 'DM08', 'Máy bơm nước chìm 750W',     'TK-750', 'cái', 1155000, 1403000, 1650000,  50, 'NCC01'),
    ('TB30', 'DM09', 'Bình phun bọt tuyết 2 lít',  'TK-2L',  'cái',  315000,  383000,  450000, 120, 'NCC01'),
    ('TB31', 'DM10', 'Máy xoa vữa 600 mm',         'TK-600', 'cái', 4830000, 5865000, 6900000,  20, 'NCC02');

INSERT INTO san_pham (ma_sp, ten, don_vi, model, ma_dm, gia_nhap, gia_xuat, gia_ban_le)
SELECT ma_sp, ten, don_vi, model, ma_dm, gia_nhap, gia_xuat, gia_ban_le FROM hang_moi
ON CONFLICT (ma_sp) DO UPDATE SET ten = EXCLUDED.ten, don_vi = EXCLUDED.don_vi, model = EXCLUDED.model,
    ma_dm = EXCLUDED.ma_dm, gia_nhap = EXCLUDED.gia_nhap, gia_xuat = EXCLUDED.gia_xuat, gia_ban_le = EXCLUDED.gia_ban_le;

-- Phiếu nhập đầu kỳ đúng bằng tồn kho tổng; bỏ qua mặt hàng đã có phiếu nhập hoặc dòng kho tổng
INSERT INTO phieu_nhap (ma_sp, so_luong, ma_ncc, don_gia)
SELECT h.ma_sp, h.ton_tong, h.ma_ncc, h.gia_nhap
FROM hang_moi h
WHERE NOT EXISTS (SELECT 1 FROM phieu_nhap pn WHERE pn.ma_sp = h.ma_sp)
  AND NOT EXISTS (SELECT 1 FROM kho_tong kt WHERE kt.ma_sp = h.ma_sp);

INSERT INTO kho_tong (ma_sp, so_luong)
SELECT ma_sp, ton_tong FROM hang_moi
ON CONFLICT (ma_sp) DO NOTHING;

-- Chi nhánh ảo của trình giả lập tải có đủ mặt hàng như seed_loadsim.sql
INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT cn.ma_cn, h.ma_sp, 1000000, 0
FROM chi_nhanh cn CROSS JOIN hang_moi h
WHERE cn.gia_lap
ON CONFLICT (ma_cn, ma_sp) DO NOTHING;

COMMIT;
