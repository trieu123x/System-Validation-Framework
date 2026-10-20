-- Dữ liệu mẫu để demo. Mật khẩu mọi chi nhánh: 123456
-- mat_khau_hash = hex(SHA-256(salt || mat_khau)); phía Java phải băm theo cùng quy tắc.

BEGIN;

INSERT INTO chi_nhanh (ma_cn, ten, dia_chi, mat_khau_hash, salt)
SELECT ma_cn, ten, dia_chi,
       encode(sha256(convert_to(salt || '123456', 'UTF8')), 'hex'),
       salt
FROM (VALUES
    ('CN01', 'Chi nhánh Hà Nội',    'Cầu Giấy, Hà Nội',     'a1b2c3d4e5f60718'),
    ('CN02', 'Chi nhánh Đà Nẵng',   'Hải Châu, Đà Nẵng',    '9f8e7d6c5b4a3921'),
    ('CN03', 'Chi nhánh TP.HCM',    'Quận 1, TP.HCM',       '0a1b2c3d4e5f6071')
) AS v(ma_cn, ten, dia_chi, salt);

INSERT INTO san_pham (ma_sp, ten, don_vi, gia) VALUES
    ('SP01', 'Nước suối 500ml',   'chai', 5000),
    ('SP02', 'Mì gói',            'gói',  4000),
    ('SP03', 'Sữa tươi 1L',       'hộp',  32000),
    ('SP04', 'Gạo 5kg',           'bao',  120000),
    ('SP05', 'Dầu ăn 1L',         'chai', 55000);

INSERT INTO kho_tong (ma_sp, so_luong) VALUES
    ('SP01', 1000),
    ('SP02', 800),
    ('SP03', 300),
    ('SP04', 150),
    ('SP05', 200);

INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT cn.ma_cn, sp.ma_sp, 50, 10
FROM chi_nhanh cn CROSS JOIN san_pham sp;

COMMIT;
