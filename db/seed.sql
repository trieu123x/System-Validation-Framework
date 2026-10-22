-- Dữ liệu mẫu để demo: đại lý máy móc theo mẫu Công ty TNHH XNK Toboki Việt Nam (ngành 4653).
-- Giá bán lẻ lấy từ meta.vn (21/10/2026); giá nhập = 70%, giá xuất cho chi nhánh = 85% giá bán lẻ.
-- Mật khẩu mọi chi nhánh: 123456
-- mat_khau_hash = hex(SHA-256(salt || mat_khau)); phía Java phải băm theo cùng quy tắc.
-- Chạy lại được: mọi INSERT có ON CONFLICT hoặc NOT EXISTS.

BEGIN;

INSERT INTO chi_nhanh (ma_cn, ten, dia_chi, mat_khau_hash, salt)
SELECT ma_cn, ten, dia_chi,
       encode(sha256(convert_to(salt || '123456', 'UTF8')), 'hex'),
       salt
FROM (VALUES
    ('CN01', 'Chi nhánh Lĩnh Nam',  'Tổ 21, Lĩnh Nam, Hoàng Mai, Hà Nội', 'a1b2c3d4e5f60718'),
    ('CN02', 'Chi nhánh Đà Nẵng',   'Hải Châu, Đà Nẵng',    '9f8e7d6c5b4a3921'),
    ('CN03', 'Chi nhánh TP.HCM',    'Quận 1, TP.HCM',       '0a1b2c3d4e5f6071')
) AS v(ma_cn, ten, dia_chi, salt)
ON CONFLICT (ma_cn) DO UPDATE SET ten = EXCLUDED.ten, dia_chi = EXCLUDED.dia_chi;

INSERT INTO danh_muc (ma_dm, ten) VALUES
    ('DM01', 'Máy hút bụi'),
    ('DM02', 'Máy cắt gạch'),
    ('DM03', 'Máy tời, pa lăng'),
    ('DM04', 'Máy rửa xe'),
    ('DM05', 'Máy đầm'),
    ('DM06', 'Phụ kiện máy đầm'),
    ('DM07', 'Máy khoan')
ON CONFLICT (ma_dm) DO UPDATE SET ten = EXCLUDED.ten;

-- Tên nhà cung cấp là hư cấu
INSERT INTO nha_cung_cap (ma_ncc, ten, dia_chi) VALUES
    ('NCC01', 'Nhà máy Toboki (Chiết Giang, TQ)', 'Chiết Giang, Trung Quốc'),
    ('NCC02', 'Cty TNHH Thiết bị Đông Á',         'Hoàng Mai, Hà Nội'),
    ('NCC03', 'Cty CP Phụ tùng Máy Việt',          'Dĩ An, Bình Dương')
ON CONFLICT (ma_ncc) DO UPDATE SET ten = EXCLUDED.ten, dia_chi = EXCLUDED.dia_chi;

-- Bảng tạm: mặt hàng kèm tồn kho tổng đầu kỳ và nhà cung cấp của phiếu nhập đầu kỳ
CREATE TEMP TABLE hang_toboki (
    ma_sp VARCHAR(10), ma_dm VARCHAR(10), ten VARCHAR(150), model VARCHAR(30), don_vi VARCHAR(20),
    gia_nhap NUMERIC(15,0), gia_xuat NUMERIC(15,0), gia_ban_le NUMERIC(15,0), ton_tong INTEGER, ma_ncc VARCHAR(10)
) ON COMMIT DROP;

INSERT INTO hang_toboki VALUES
    ('TB01', 'DM01', 'Máy hút bụi công nghiệp khô và ướt 16 lít', 'TK-16L',    'cái',   763000,   927000,  1090000, 120, 'NCC01'),
    ('TB02', 'DM01', 'Máy hút bụi 35 lít',                        'TK-35L',    'cái',  1113000,  1352000,  1590000, 100, 'NCC01'),
    ('TB03', 'DM01', 'Máy hút bụi 45 lít',                        'TK-45L',    'cái',  1295000,  1573000,  1850000,  80, 'NCC01'),
    ('TB04', 'DM01', 'Máy hút bụi 80 lít, 2 mô tơ',               'TK-80L',    'cái',  2555000,  3103000,  3650000,  60, 'NCC01'),
    ('TB05', 'DM01', 'Máy hút bụi 100 lít, 3 mô tơ',              'TK-100L',   'cái',  3325000,  4038000,  4750000,  60, 'NCC01'),
    ('TB06', 'DM02', 'Bàn cắt gạch 800 mm',                       'T-800',     'cái',   805000,   978000,  1150000, 150, 'NCC02'),
    ('TB07', 'DM02', 'Bàn cắt gạch 1000 mm',                      'T-1000',    'cái',  1015000,  1233000,  1450000, 120, 'NCC02'),
    ('TB08', 'DM02', 'Bàn cắt gạch 1200 mm',                      'T-1200',    'cái',  1330000,  1615000,  1900000, 100, 'NCC02'),
    ('TB09', 'DM03', 'Máy tời TK200/25',                          'TK200/25',  'cái',  1106000,  1343000,  1580000, 200, 'NCC02'),
    ('TB10', 'DM03', 'Máy tời TK400/25',                          'TK400/25',  'cái',  1645000,  1998000,  2350000, 150, 'NCC02'),
    ('TB11', 'DM03', 'Máy tời TK600/25',                          'TK600/25',  'cái',  1470000,  1785000,  2100000, 150, 'NCC02'),
    ('TB12', 'DM03', 'Máy tời TK1000',                            'TK1000',    'cái',  2485000,  3018000,  3550000,  80, 'NCC02'),
    ('TB13', 'DM03', 'Máy tời TK1200/25',                         'TK1200/25', 'cái',  2387000,  2899000,  3410000,  80, 'NCC02'),
    ('TB14', 'DM03', 'Máy tời TK1500/25',                         'TK1500/25', 'cái',  2478000,  3009000,  3540000,  60, 'NCC02'),
    ('TB15', 'DM03', 'Máy tời 2400W, cáp 30 m',                   'TK2400',    'cái',  3213000,  3902000,  4590000,  60, 'NCC02'),
    ('TB16', 'DM04', 'Máy rửa xe TK-888',                         'TK-888',    'cái',  1491000,  1811000,  2130000, 100, 'NCC01'),
    ('TB17', 'DM04', 'Máy rửa xe chỉnh áp 2.500W',                'TK-999',    'cái',  1407000,  1709000,  2010000, 100, 'NCC01'),
    ('TB18', 'DM04', 'Máy rửa xe cao áp TOK2700',                 'TOK2700',   'cái',  5530000,  6715000,  7900000,  40, 'NCC01'),
    ('TB19', 'DM04', 'Máy rửa xe cao áp TOK4000',                 'TOK4000',   'cái',  7840000,  9520000, 11200000,  30, 'NCC01'),
    ('TB20', 'DM04', 'Máy rửa xe cao áp TOK5500',                 'TOK5500',   'cái', 10360000, 12580000, 14800000,  25, 'NCC01'),
    ('TB21', 'DM04', 'Máy rửa xe cao áp TOK7500',                 'TOK7500',   'cái', 12950000, 15725000, 18500000,  20, 'NCC01'),
    ('TB22', 'DM05', 'Máy đầm gà 1.100W',                         'TK-35',     'cái',   350000,   425000,   500000, 200, 'NCC01'),
    ('TB23', 'DM05', 'Máy đầm TK-45',                             'TK-45',     'cái',   350000,   425000,   500000, 200, 'NCC01'),
    ('TB24', 'DM05', 'Máy đầm dùi DR-1100',                       'DR-1100',   'cái',  1015000,  1233000,  1450000, 120, 'NCC01'),
    ('TB25', 'DM05', 'Máy đầm dùi 2.500W',                        'DR-2500',   'cái',  1505000,  1828000,  2150000, 100, 'NCC01'),
    ('TB26', 'DM06', 'Dây đầm gà 1,2 m / 1,5 m',                  NULL,        'sợi',   196000,   238000,   280000, 300, 'NCC03'),
    ('TB27', 'DM06', 'Dây đầm dùi',                               NULL,        'sợi',   441000,   536000,   630000, 300, 'NCC03'),
    ('TB28', 'DM07', 'Máy khoan bàn 375W, mũi 1,5–13 mm',         'TK-13KB',   'cái',  1498000,  1819000,  2140000,  80, 'NCC02');

INSERT INTO san_pham (ma_sp, ten, don_vi, model, ma_dm, gia_nhap, gia_xuat, gia_ban_le)
SELECT ma_sp, ten, don_vi, model, ma_dm, gia_nhap, gia_xuat, gia_ban_le FROM hang_toboki
ON CONFLICT (ma_sp) DO UPDATE SET ten = EXCLUDED.ten, don_vi = EXCLUDED.don_vi, model = EXCLUDED.model,
    ma_dm = EXCLUDED.ma_dm, gia_nhap = EXCLUDED.gia_nhap, gia_xuat = EXCLUDED.gia_xuat, gia_ban_le = EXCLUDED.gia_ban_le;

-- Phiếu nhập đầu kỳ theo giá nhập, đúng bằng tồn kho tổng (kho_tong = Σ nhập − Σ xuất).
-- Chỉ ghi cho mặt hàng chưa có phiếu nhập nào, để chạy lại không nhân đôi.
INSERT INTO phieu_nhap (ma_sp, so_luong, ma_ncc, don_gia)
SELECT h.ma_sp, h.ton_tong, h.ma_ncc, h.gia_nhap
FROM hang_toboki h
WHERE NOT EXISTS (SELECT 1 FROM phieu_nhap pn WHERE pn.ma_sp = h.ma_sp)
  AND NOT EXISTS (SELECT 1 FROM kho_tong kt WHERE kt.ma_sp = h.ma_sp);

INSERT INTO kho_tong (ma_sp, so_luong)
SELECT ma_sp, ton_tong FROM hang_toboki
ON CONFLICT (ma_sp) DO NOTHING;

-- Kho chi nhánh thật: tồn 10, ngưỡng 3; dây đầm (DM06) tồn 30, ngưỡng 10
INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT cn.ma_cn, sp.ma_sp,
       CASE WHEN sp.ma_dm = 'DM06' THEN 30 ELSE 10 END,
       CASE WHEN sp.ma_dm = 'DM06' THEN 10 ELSE 3 END
FROM chi_nhanh cn CROSS JOIN san_pham sp
WHERE NOT cn.gia_lap
ON CONFLICT (ma_cn, ma_sp) DO NOTHING;

COMMIT;
