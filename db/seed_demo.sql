-- Dữ liệu demo cỡ lớn để test giao diện và luồng nghiệp vụ.
-- Chạy SAU schema.sql + seed.sql + seed_loadsim.sql (scripts\seed-demo.bat).
-- Chạy lại được: XOÁ toàn bộ dữ liệu giao dịch cũ (yêu cầu, phiếu nhập/xuất, bán hàng, điều chuyển,
-- nhật ký, tin chờ) rồi sinh lại. Giữ nguyên tài khoản chi nhánh ảo SIM.
-- Kết quả: 15 chi nhánh thật (mật khẩu 123456), 30 mặt hàng, ~60 ngày lịch sử; đối soát kho (NFR-03) vẫn khớp.
-- Các bất biến được giữ giống server:
--   tổng phiếu xuất = Σ giao của YC HOAN_TAT lấy từ kho tổng + Σ giao của YC DA_GIAO
--   YC nhận qua điều chuyển có dieu_chuyen HOAN_TAT, không có phiếu xuất
--   kho_tong = Σ phiếu nhập − Σ phiếu xuất ≥ 0; tối đa một YC mở cho mỗi (CN, SP)

BEGIN;

-- Không RESTART IDENTITY: client.jar lọc tin trùng theo mã YC nên mã mới phải khác mã cũ
TRUNCATE dieu_chuyen, phieu_xuat, yeu_cau, phieu_nhap, ban_hang, nhat_ky, hang_doi_tin;

-- Cố định bộ sinh số ngẫu nhiên để lần chạy nào cũng ra cùng dữ liệu
DO $$ BEGIN PERFORM setseed(0.2026); END $$;

-- ---------- chi nhánh ----------
INSERT INTO chi_nhanh (ma_cn, ten, dia_chi, mat_khau_hash, salt)
SELECT ma_cn, ten, dia_chi,
       encode(sha256(convert_to('demo-' || ma_cn || '123456', 'UTF8')), 'hex'),
       'demo-' || ma_cn
FROM (VALUES
    ('CN04', 'Chi nhánh Hải Phòng',      'Lê Chân, Hải Phòng'),
    ('CN05', 'Chi nhánh Cần Thơ',        'Ninh Kiều, Cần Thơ'),
    ('CN06', 'Chi nhánh Huế',            'Phú Hội, TP. Huế'),
    ('CN07', 'Chi nhánh Nha Trang',      'Lộc Thọ, Nha Trang'),
    ('CN08', 'Chi nhánh Vinh',           'Hưng Dũng, Vinh'),
    ('CN09', 'Chi nhánh Biên Hòa',       'Tân Phong, Biên Hòa'),
    ('CN10', 'Chi nhánh Quy Nhơn',       'Lê Lợi, Quy Nhơn'),
    ('CN11', 'Chi nhánh Thái Nguyên',    'Hoàng Văn Thụ, Thái Nguyên'),
    ('CN12', 'Chi nhánh Buôn Ma Thuột',  'Tân Lợi, Buôn Ma Thuột'),
    ('CN13', 'Chi nhánh Vũng Tàu',       'Phường 7, Vũng Tàu'),
    ('CN14', 'Chi nhánh Nam Định',       'Trần Đăng Ninh, Nam Định'),
    ('CN15', 'Chi nhánh Long Xuyên',     'Mỹ Long, Long Xuyên')
) AS v(ma_cn, ten, dia_chi)
ON CONFLICT (ma_cn) DO UPDATE SET ten = EXCLUDED.ten, dia_chi = EXCLUDED.dia_chi;

-- ---------- mặt hàng (SP01..SP05 giữ như seed.sql vì bộ thực nghiệm dùng) ----------
INSERT INTO san_pham (ma_sp, ten, don_vi, gia) VALUES
    ('SP06', 'Nước mắm 500ml',            'chai',  38000),
    ('SP07', 'Nước tương 500ml',          'chai',  18000),
    ('SP08', 'Đường trắng 1kg',           'gói',   24000),
    ('SP09', 'Muối i-ốt 500g',            'gói',    6000),
    ('SP10', 'Bột ngọt 400g',             'gói',   32000),
    ('SP11', 'Cà phê hòa tan (20 gói)',   'hộp',   58000),
    ('SP12', 'Trà xanh đóng chai 455ml',  'chai',  10000),
    ('SP13', 'Nước ngọt có gas 330ml',    'lon',    9000),
    ('SP14', 'Bia lon 330ml (24 lon)',    'thùng', 340000),
    ('SP15', 'Sữa chua (lốc 4 hộp)',      'lốc',   28000),
    ('SP16', 'Bánh quy bơ 300g',          'hộp',   45000),
    ('SP17', 'Snack khoai tây 52g',       'gói',   12000),
    ('SP18', 'Kẹo trái cây 150g',         'gói',   20000),
    ('SP19', 'Dầu gội 650ml',             'chai', 145000),
    ('SP20', 'Sữa tắm 900ml',             'chai', 165000),
    ('SP21', 'Kem đánh răng 180g',        'tuýp',  35000),
    ('SP22', 'Bột giặt 3kg',              'túi',  155000),
    ('SP23', 'Nước rửa chén 750ml',       'chai',  32000),
    ('SP24', 'Giấy vệ sinh (10 cuộn)',    'bịch',  78000),
    ('SP25', 'Khăn giấy rút 180 tờ',      'gói',   22000),
    ('SP26', 'Trứng gà (hộp 10 quả)',     'hộp',   35000),
    ('SP27', 'Xúc xích 500g',             'gói',   62000),
    ('SP28', 'Cá hộp sốt cà 155g',        'hộp',   26000),
    ('SP29', 'Bún khô 500g',              'gói',   22000),
    ('SP30', 'Nước khoáng 1,5L',          'chai',  12000)
ON CONFLICT (ma_sp) DO UPDATE SET ten = EXCLUDED.ten, don_vi = EXCLUDED.don_vi, gia = EXCLUDED.gia;

INSERT INTO kho_tong (ma_sp, so_luong) SELECT ma_sp, 0 FROM san_pham ON CONFLICT (ma_sp) DO NOTHING;

-- Chi nhánh ảo cũng có đủ mặt hàng mới (tồn lớn, không ngưỡng) như seed_loadsim.sql
INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT cn.ma_cn, sp.ma_sp, 1000000, 0
FROM chi_nhanh cn CROSS JOIN san_pham sp
WHERE cn.gia_lap
ON CONFLICT (ma_cn, ma_sp) DO NOTHING;

-- ---------- tồn kho chi nhánh thật ----------
-- ~8% chưa đặt ngưỡng, ~14% dưới ngưỡng (sẽ có YC mở), còn lại đủ hoặc sắp chạm ngưỡng
DELETE FROM kho_chi_nhanh k USING chi_nhanh cn WHERE cn.ma_cn = k.ma_cn AND NOT cn.gia_lap;

INSERT INTO kho_chi_nhanh (ma_cn, ma_sp, so_luong, nguong_toi_thieu)
SELECT ma_cn, ma_sp,
       CASE WHEN nguong = 0 THEN 20 + floor(r * 150)::int
            WHEN low THEN floor(r * nguong)::int
            ELSE nguong + floor(r * nguong * 4)::int END,
       nguong
FROM (
    SELECT cn.ma_cn, sp.ma_sp,
           CASE WHEN random() < 0.08 THEN 0 ELSE 10 + 5 * floor(random() * 7)::int END AS nguong,
           random() < 0.14 AS low,
           random() AS r
    FROM chi_nhanh cn CROSS JOIN san_pham sp
    WHERE NOT cn.gia_lap
) t;

-- ---------- yêu cầu, phiếu xuất, điều chuyển, phiếu nhập ----------
DO $$
DECLARE
    cns     text[] := ARRAY(SELECT ma_cn FROM chi_nhanh WHERE NOT gia_lap ORDER BY ma_cn);
    sps     text[] := ARRAY(SELECT ma_sp FROM san_pham ORDER BY ma_sp);
    -- mặt hàng kho tổng gần hết: sinh THIEU_HANG và cảnh báo "kho tổng không đủ"
    low_sps text[] := ARRAY['SP04', 'SP14', 'SP19', 'SP22'];
    cn      text;
    sp      text;
    donor   text;
    r       record;
    i       int;
    k       int;
    q       int;
    qq      int;
    yc      int;
    roll    float8;
    t       timestamp;
    total   int;
    part    int;
    left_   int;
    target  int;
    ncc     text[] := ARRAY['Cty TNHH Thực phẩm An Phát', 'Cty CP Phân phối Minh Long', 'Cty TNHH Hóa mỹ phẩm Sao Việt',
                            'Cty CP Đồ uống Tân Hưng', 'Nhà phân phối Hoàng Gia', 'Cty TNHH Nông sản Phương Nam'];
BEGIN
    -- 1) YC đã đóng trong 60 ngày qua
    FOREACH cn IN ARRAY cns LOOP
        FOR i IN 1..(25 + floor(random() * 20)::int) LOOP
            sp := sps[1 + floor(random() * array_length(sps, 1))::int];
            t := date_trunc('minute', localtimestamp - interval '60 days' + random() * interval '57 days');
            q := 5 * (4 + floor(random() * 13)::int);
            roll := random();
            IF roll < 0.12 THEN
                INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (cn, sp, q, 'TU_CHOI', t, t + interval '40 minutes');
            ELSIF roll < 0.20 THEN
                -- kho tổng thiếu, nhận hàng điều chuyển từ chi nhánh khác
                qq := least(q, 5 * (2 + floor(random() * 6)::int));
                INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, so_luong_chot, so_luong_giao, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (cn, sp, q, qq, qq, 'HOAN_TAT', t, t + interval '26 hours') RETURNING ma_yc INTO yc;
                IF random() < 0.4 THEN
                    LOOP donor := cns[1 + floor(random() * array_length(cns, 1))::int]; EXIT WHEN donor <> cn; END LOOP;
                    INSERT INTO dieu_chuyen (ma_yc, tu_cn, den_cn, ma_sp, so_luong, trang_thai, tao_luc, cap_nhat_luc)
                    VALUES (yc, donor, cn, sp, qq, 'TU_CHOI', t + interval '1 hour', t + interval '2 hours');
                END IF;
                LOOP donor := cns[1 + floor(random() * array_length(cns, 1))::int]; EXIT WHEN donor <> cn; END LOOP;
                INSERT INTO dieu_chuyen (ma_yc, tu_cn, den_cn, ma_sp, so_luong, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (yc, donor, cn, sp, qq, 'HOAN_TAT', t + interval '2 hours', t + interval '5 hours');
            ELSE
                qq := CASE WHEN random() < 0.85 THEN q ELSE q - 5 * (1 + floor(random() * 3)::int) END;
                INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, so_luong_chot, so_luong_giao, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (cn, sp, q, qq, qq, 'HOAN_TAT', t, t + interval '6 hours' + random() * interval '30 hours')
                RETURNING ma_yc INTO yc;
                INSERT INTO phieu_xuat (ma_yc, ma_cn, ma_sp, so_luong, thoi_gian)
                VALUES (yc, cn, sp, qq, t + interval '90 minutes');
            END IF;
        END LOOP;
    END LOOP;

    -- 2) YC đang mở cho mọi mặt hàng dưới ngưỡng (như LOW_STOCK đã gửi)
    FOR r IN
        SELECT k.ma_cn, k.ma_sp, k.so_luong, k.nguong_toi_thieu AS nguong
        FROM kho_chi_nhanh k JOIN chi_nhanh c ON c.ma_cn = k.ma_cn AND NOT c.gia_lap
        WHERE k.nguong_toi_thieu > 0 AND k.so_luong < k.nguong_toi_thieu
        ORDER BY k.ma_cn, k.ma_sp
    LOOP
        t := date_trunc('second', localtimestamp - interval '3 hours' - random() * interval '45 hours');
        q := 2 * r.nguong - r.so_luong;
        roll := random();
        IF r.ma_sp = ANY (low_sps) THEN
            IF roll < 0.5 THEN
                INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, so_luong_chot, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (r.ma_cn, r.ma_sp, q, q, 'THIEU_HANG', t, t + interval '50 minutes') RETURNING ma_yc INTO yc;
                -- lời mời điều chuyển đang chờ, chọn CN dư nhiều nhất như TransferService.tryStart
                SELECT k.ma_cn, k.so_luong - 2 * k.nguong_toi_thieu INTO donor, qq
                FROM kho_chi_nhanh k JOIN chi_nhanh c ON c.ma_cn = k.ma_cn AND NOT c.gia_lap
                WHERE k.ma_sp = r.ma_sp AND k.ma_cn <> r.ma_cn AND k.so_luong > 2 * k.nguong_toi_thieu
                ORDER BY 2 DESC LIMIT 1;
                IF donor IS NOT NULL THEN
                    INSERT INTO dieu_chuyen (ma_yc, tu_cn, den_cn, ma_sp, so_luong, trang_thai, tao_luc, cap_nhat_luc)
                    VALUES (yc, donor, r.ma_cn, r.ma_sp, least(q, qq), 'CHO', t + interval '51 minutes', t + interval '51 minutes');
                END IF;
            ELSE
                INSERT INTO yeu_cau (ma_cn, ma_sp, trang_thai, tao_luc, cap_nhat_luc)
                VALUES (r.ma_cn, r.ma_sp, 'CHO', t, t);
            END IF;
        ELSIF roll < 0.5 THEN
            INSERT INTO yeu_cau (ma_cn, ma_sp, trang_thai, tao_luc, cap_nhat_luc)
            VALUES (r.ma_cn, r.ma_sp, 'CHO', t, t);
        ELSIF roll < 0.75 THEN
            INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, trang_thai, tao_luc, cap_nhat_luc)
            VALUES (r.ma_cn, r.ma_sp, q, 'DA_DE_XUAT', t, t + interval '20 minutes');
        ELSE
            INSERT INTO yeu_cau (ma_cn, ma_sp, so_luong_de_xuat, so_luong_chot, so_luong_giao, trang_thai, tao_luc, cap_nhat_luc)
            VALUES (r.ma_cn, r.ma_sp, q, q, q, 'DA_GIAO', t, t + interval '2 hours') RETURNING ma_yc INTO yc;
            INSERT INTO phieu_xuat (ma_yc, ma_cn, ma_sp, so_luong, thoi_gian)
            VALUES (yc, r.ma_cn, r.ma_sp, q, t + interval '2 hours');
        END IF;
    END LOOP;

    -- 3) Phiếu nhập kho tổng: tổng nhập = tổng xuất + tồn mong muốn, chia thành 3–6 phiếu trong 90 ngày
    FOR r IN
        SELECT sp.ma_sp, COALESCE(sum(px.so_luong), 0)::int AS xuat
        FROM san_pham sp LEFT JOIN phieu_xuat px ON px.ma_sp = sp.ma_sp
        GROUP BY sp.ma_sp ORDER BY sp.ma_sp
    LOOP
        target := CASE WHEN r.ma_sp = ANY (low_sps) THEN floor(random() * 9)::int
                       ELSE 10 * (30 + floor(random() * 170)::int) END;
        total := r.xuat + target;
        IF total > 0 THEN
            k := CASE WHEN total < 60 THEN 1 ELSE 3 + floor(random() * 4)::int END;
            left_ := total;
            FOR i IN 1..k LOOP
                part := CASE WHEN i = k THEN left_ ELSE greatest(10, 10 * round(total / k / 10.0 * (0.7 + random() * 0.6))::int) END;
                part := least(part, left_ - (k - i));
                INSERT INTO phieu_nhap (ma_sp, so_luong, nha_cung_cap, thoi_gian)
                VALUES (r.ma_sp, part, ncc[1 + floor(random() * array_length(ncc, 1))::int],
                        date_trunc('minute', localtimestamp - (90 - (i - 1) * 85 / k) * interval '1 day'
                                             + random() * interval '10 hours'));
                left_ := left_ - part;
            END LOOP;
        END IF;
        UPDATE kho_tong SET so_luong = target WHERE ma_sp = r.ma_sp;
    END LOOP;
END $$;

-- ---------- bán hàng 60 ngày (~35% cặp CN–SP có bán mỗi ngày) ----------
INSERT INTO ban_hang (ma_cn, ma_sp, so_luong, thoi_gian)
SELECT ma_cn, ma_sp, so_luong, thoi_gian
FROM (
    SELECT k.ma_cn, k.ma_sp, 1 + floor(random() * 6)::int AS so_luong,
           d + interval '7 hours' + random() * interval '14 hours' AS thoi_gian
    FROM kho_chi_nhanh k
    JOIN chi_nhanh c ON c.ma_cn = k.ma_cn AND NOT c.gia_lap
    CROSS JOIN generate_series((current_date - 59)::timestamp, current_date::timestamp, interval '1 day') AS d
    WHERE random() < 0.35
) s
WHERE thoi_gian < localtimestamp
ORDER BY thoi_gian;

-- ---------- nhật ký giao thức (để trang Giám sát có dữ liệu tra cứu) ----------
INSERT INTO nhat_ky (ma_cn, chieu, lenh, noi_dung, thoi_gian)
SELECT ma_cn, chieu, lenh, noi_dung, thoi_gian FROM (
    -- đăng nhập đầu ngày
    SELECT c.ma_cn, 'OUT' AS chieu, 'LOGIN_OK' AS lenh, 'LOGIN_OK|' || c.ten AS noi_dung,
           current_date + interval '7 hours' + random() * interval '40 minutes' AS thoi_gian
    FROM chi_nhanh c WHERE NOT c.gia_lap
    UNION ALL
    -- bán hàng 2 ngày gần nhất
    SELECT b.ma_cn, 'IN', 'SALE', 'SALE|' || b.ma_sp || '|' || b.so_luong, b.thoi_gian
    FROM ban_hang b WHERE b.thoi_gian > localtimestamp - interval '2 days'
    UNION ALL
    SELECT b.ma_cn, 'OUT', 'SALE_OK', 'SALE_OK|' || b.ma_sp || '|' || k.so_luong, b.thoi_gian + interval '4 milliseconds'
    FROM ban_hang b JOIN kho_chi_nhanh k ON k.ma_cn = b.ma_cn AND k.ma_sp = b.ma_sp
    WHERE b.thoi_gian > localtimestamp - interval '2 days'
    UNION ALL
    -- luồng cấp hàng của YC trong 7 ngày gần nhất
    SELECT y.ma_cn, 'IN', 'LOW_STOCK', 'LOW_STOCK|' || y.ma_sp || '|' || k.so_luong || '|' || k.nguong_toi_thieu, y.tao_luc
    FROM yeu_cau y JOIN kho_chi_nhanh k ON k.ma_cn = y.ma_cn AND k.ma_sp = y.ma_sp
    WHERE y.tao_luc > localtimestamp - interval '7 days'
    UNION ALL
    SELECT y.ma_cn, 'OUT', 'OFFER', 'OFFER|' || y.ma_yc || '|' || y.ma_sp || '|' || y.so_luong_de_xuat, y.tao_luc + interval '15 minutes'
    FROM yeu_cau y WHERE y.so_luong_de_xuat IS NOT NULL AND y.tao_luc > localtimestamp - interval '7 days'
    UNION ALL
    SELECT y.ma_cn, 'IN', 'REJECT', 'REJECT|' || y.ma_yc, y.cap_nhat_luc
    FROM yeu_cau y WHERE y.trang_thai = 'TU_CHOI' AND y.tao_luc > localtimestamp - interval '7 days'
    UNION ALL
    SELECT y.ma_cn, 'IN', 'ACCEPT', 'ACCEPT|' || y.ma_yc || '|' || y.so_luong_chot, y.tao_luc + interval '45 minutes'
    FROM yeu_cau y WHERE y.so_luong_chot IS NOT NULL AND y.tao_luc > localtimestamp - interval '7 days'
    UNION ALL
    SELECT y.ma_cn, 'OUT', 'OUT_OF_STOCK', 'OUT_OF_STOCK|' || y.ma_yc || '|' || kt.so_luong, y.cap_nhat_luc
    FROM yeu_cau y JOIN kho_tong kt ON kt.ma_sp = y.ma_sp WHERE y.trang_thai = 'THIEU_HANG'
    UNION ALL
    SELECT px.ma_cn, 'OUT', 'DELIVERED', 'DELIVERED|' || px.ma_yc || '|' || px.ma_sp || '|' || px.so_luong, px.thoi_gian
    FROM phieu_xuat px WHERE px.thoi_gian > localtimestamp - interval '7 days'
    UNION ALL
    SELECT y.ma_cn, 'IN', 'RECEIVED', 'RECEIVED|' || y.ma_yc, y.cap_nhat_luc
    FROM yeu_cau y WHERE y.trang_thai = 'HOAN_TAT' AND y.tao_luc > localtimestamp - interval '7 days'
    UNION ALL
    SELECT dc.tu_cn, 'OUT', 'TRANSFER_REQ', 'TRANSFER_REQ|' || dc.ma_dc || '|' || dc.ma_sp || '|' || dc.so_luong || '|' || c.ten, dc.tao_luc
    FROM dieu_chuyen dc JOIN chi_nhanh c ON c.ma_cn = dc.den_cn WHERE dc.tao_luc > localtimestamp - interval '7 days'
) e
WHERE thoi_gian < localtimestamp
ORDER BY thoi_gian;

-- ---------- tin chờ gửi cho các chi nhánh chưa đăng nhập (FR-21) ----------
INSERT INTO hang_doi_tin (ma_cn, noi_dung, tao_luc)
SELECT ma_cn, 'BROADCAST|Lịch kiểm kê quý IV: các chi nhánh chốt số liệu tồn kho trước 17h ngày 31/10.',
       localtimestamp - interval '5 hours'
FROM chi_nhanh WHERE ma_cn BETWEEN 'CN10' AND 'CN15';

INSERT INTO hang_doi_tin (ma_cn, noi_dung, tao_luc)
SELECT ma_cn, 'BROADCAST|Từ 01/11 áp dụng bảng giá mới cho nhóm nước giải khát, đề nghị kiểm tra lại tem giá.',
       localtimestamp - interval '2 hours'
FROM chi_nhanh WHERE ma_cn IN ('CN12', 'CN14');

COMMIT;
