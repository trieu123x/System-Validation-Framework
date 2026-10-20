-- Tài khoản cho trình giả lập tải (SRS 7.2-G, TC-11): SIM001..SIM1000, mật khẩu 123456.
-- Tồn kho lớn và ngưỡng 0 để giả lập bán liên tục không sinh cảnh báo.

BEGIN;

ALTER TABLE chi_nhanh ADD COLUMN IF NOT EXISTS gia_lap BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO chi_nhanh (ma_cn, ten, dia_chi, mat_khau_hash, salt, gia_lap)
-- lpad cắt chuỗi dài hơn 3 ký tự, nên SIM1000 phải giữ nguyên 4 chữ số
SELECT 'SIM' || lpad(i::text, greatest(3, length(i::text)), '0'),
       'Chi nhánh ảo ' || i,
       'Trình giả lập tải',
       encode(sha256(convert_to('sim-salt-' || i || '123456', 'UTF8')), 'hex'),
       'sim-salt-' || i,
       TRUE
FROM generate_series(1, 1000) AS i
ON CONFLICT (ma_cn) DO UPDATE SET gia_lap = TRUE;

INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT cn.ma_cn, sp.ma_sp, 1000000, 0
FROM chi_nhanh cn CROSS JOIN san_pham sp
WHERE cn.ma_cn LIKE 'SIM%'
ON CONFLICT (ma_cn, ma_sp) DO UPDATE SET so_luong = 1000000, nguong_toi_thieu = 0;

COMMIT;
