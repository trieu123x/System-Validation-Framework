-- Thông số kỹ thuật TB01..TB31 (chạy lại được). Chạy sau seed_images.sql.
-- Nguồn: trang sản phẩm toboki.vn (hãng) và meta.vn; hai nguồn lệch nhau thì lấy số của toboki.vn.
-- "nguồn: ten_sp" = chỉ lấy từ tên sản phẩm. Không tìm được nguồn thì để NULL, không tự bịa.
-- Cột tạo sẵn ở đây để file chạy được cả trên CSDL cũ trước khi server (SpecSchema) khởi động.
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS cong_suat_w    INTEGER      CHECK (cong_suat_w BETWEEN 1 AND 100000);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS dien_ap_v      INTEGER      CHECK (dien_ap_v BETWEEN 1 AND 1000);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS trong_luong_kg NUMERIC(7,1) CHECK (trong_luong_kg > 0);
ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS thong_so       JSONB        NOT NULL DEFAULT '{}'::jsonb;

-- TB01 · nguồn: https://toboki.vn/san-pham/92 ; https://meta.vn/may-hut-bui-cong-nghiep-kho-va-uot-toboki-tk-16l-p98803
UPDATE san_pham SET cong_suat_w = 1550, dien_ap_v = 220, trong_luong_kg = 6.5, thong_so = '{"Dung tích thùng":"16 L","Chức năng":"Hút khô, hút ướt, thổi bụi","Chiều dài ống hút":"2,9 m","Xuất xứ":"Trung Quốc","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB01';
-- TB02 · nguồn: https://toboki.vn/san-pham/87 ; https://meta.vn/may-hut-bui-toboki-tk-35l-p97369
UPDATE san_pham SET cong_suat_w = 1750, dien_ap_v = 220, trong_luong_kg = 12, thong_so = '{"Dung tích thùng":"35 L","Lưu lượng khí":"53 L/s","Chất liệu thùng":"Inox","Chiều dài ống hút":"2,9 m","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB02';
-- TB03 · nguồn: https://toboki.vn/san-pham/88 ; https://meta.vn/may-hut-bui-toboki-tk-45l-p97309
UPDATE san_pham SET cong_suat_w = 1850, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Dung tích thùng":"45 L","Lưu lượng khí":"53 L/s","Chất liệu thùng":"Inox","Chiều dài ống hút":"2,9 m","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB03';
-- TB04 · nguồn: https://toboki.vn/san-pham/90 ; https://meta.vn/may-hut-bui-toboki-tk-80l-p97371
UPDATE san_pham SET cong_suat_w = 3000, dien_ap_v = 220, trong_luong_kg = 26, thong_so = '{"Dung tích thùng":"80 L","Số mô tơ":"2","Lưu lượng khí":"120 L/s","Chiều dài ống hút":"2,9 m","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB04';
-- TB05 · nguồn: https://toboki.vn/san-pham/91 ; https://meta.vn/may-hut-bui-toboki-tk-100l-p97372
UPDATE san_pham SET cong_suat_w = 4500, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Dung tích thùng":"100 L","Số mô tơ":"3","Lưu lượng khí":"120 L/s","Chất liệu thùng":"Inox","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB05';
-- TB06 · nguồn: https://toboki.vn/san-pham/1 ; https://meta.vn/ban-cat-gach-toboki-t-800-p97167
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = 14, thong_so = '{"Chiều dài cắt":"800 mm","Bề rộng bản cắt":"100 mm","Số vòng bi":"29","Xuất xứ":"Trung Quốc","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB06';
-- TB07 · nguồn: https://toboki.vn/san-pham/2 ; https://meta.vn/ban-cat-gach-toboki-t-1000-p97168
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = 16, thong_so = '{"Chiều dài cắt":"1000 mm","Bề rộng bản cắt":"100 mm","Số vòng bi":"29","Xuất xứ":"Trung Quốc","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB07';
-- TB08 · nguồn: https://toboki.vn/san-pham/3 ; https://meta.vn/ban-cat-gach-toboki-t-1200-p99737
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = 20, thong_so = '{"Chiều dài cắt":"1200 mm","Bề rộng bản cắt":"100 mm","Số vòng bi":"29","Xuất xứ":"Trung Quốc","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB08';
-- TB09 · nguồn: https://toboki.vn/san-pham/75 ; https://meta.vn/may-toi-toboki-tk200-25-p97481
UPDATE san_pham SET cong_suat_w = 550, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"100/200 kg","Độ cao nâng":"13/25 m","Đường kính cáp":"5 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB09';
-- TB10 · nguồn: https://toboki.vn/san-pham/76 ; https://meta.vn/may-toi-toboki-tk400-25-p97482
UPDATE san_pham SET cong_suat_w = 900, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"200/400 kg","Độ cao nâng":"13/25 m","Đường kính cáp":"6 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB10';
-- TB11 · nguồn: https://toboki.vn/san-pham/77 ; https://meta.vn/may-toi-toboki-tk600-25-p97514
UPDATE san_pham SET cong_suat_w = 1200, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"300/600 kg","Độ cao nâng":"13/25 m","Đường kính cáp":"6 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB11';
-- TB12 · nguồn: https://toboki.vn/san-pham/79 ; https://meta.vn/may-toi-toboki-tk1000-p97515
UPDATE san_pham SET cong_suat_w = 1850, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"500/1000 kg","Độ cao nâng":"13/25 m","Đường kính cáp":"8 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB12';
-- TB13 · nguồn: https://toboki.vn/san-pham/80 ; https://meta.vn/may-toi-toboki-tk1200-25-p97304
UPDATE san_pham SET cong_suat_w = 2100, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"600/1200 kg","Độ cao nâng":"15/25 m","Đường kính cáp":"8 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB13';
-- TB14 · nguồn: https://toboki.vn/san-pham/81 ; https://meta.vn/may-toi-toboki-tk1500-25-p97516
UPDATE san_pham SET cong_suat_w = 2300, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"750/1500 kg","Độ cao nâng":"10/25 m","Đường kính cáp":"8 mm","Lõi mô tơ":"Dây đồng","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB14';
-- TB15 · nguồn: https://toboki.vn/san-pham/82 ; https://meta.vn/may-toi-toboki-tk2400-p97517
UPDATE san_pham SET cong_suat_w = 2400, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tải trọng nâng (cáp đơn/đôi)":"600/1200 kg","Chiều dài cáp":"30 m","Đường kính cáp":"8 mm","Lõi mô tơ":"Dây đồng (tốc nhanh)","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB15';
-- TB16 · nguồn: https://toboki.vn/san-pham/13 ; https://meta.vn/may-rua-xe-toboki-tk-888-p97284
UPDATE san_pham SET cong_suat_w = 2300, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Áp lực":"8–13 MPa","Lưu lượng":"8–12 L/phút","Chiều dài dây":"8 m","Chỉnh áp":"Không","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB16';
-- TB17 · nguồn: https://toboki.vn/san-pham/14 ; https://meta.vn/may-rua-xe-toboki-tk-999-p97280
UPDATE san_pham SET cong_suat_w = 2500, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Áp lực":"8–13 MPa","Lưu lượng":"8–12 L/phút","Chiều dài dây":"8 m","Chỉnh áp":"Có","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB17';
-- TB18 · nguồn: https://toboki.vn/san-pham/17 ; https://meta.vn/may-rua-xe-cao-ap-toboki-tok2700-p97287
UPDATE san_pham SET cong_suat_w = 2700, dien_ap_v = 220, trong_luong_kg = 42, thong_so = '{"Áp lực":"100 bar","Lưu lượng":"12 L/phút","Tốc độ":"1400 vòng/phút","Chiều dài dây":"15 m","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB18';
-- TB19 · nguồn: https://toboki.vn/san-pham/19 ; https://meta.vn/may-rua-xe-cao-ap-toboki-tok4000-p97289
UPDATE san_pham SET cong_suat_w = 4000, dien_ap_v = 380, trong_luong_kg = 65, thong_so = '{"Áp lực":"160 bar","Lưu lượng":"15 L/phút","Chiều dài dây":"15 m","Nguồn điện":"3 pha","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB19';
-- TB20 · nguồn: https://toboki.vn/san-pham/20 ; https://meta.vn/may-rua-xe-cao-ap-toboki-tok5500-p97290
UPDATE san_pham SET cong_suat_w = 5500, dien_ap_v = 380, trong_luong_kg = 71, thong_so = '{"Áp lực":"230 bar","Lưu lượng":"17 L/phút","Chiều dài dây":"15 m","Nguồn điện":"3 pha","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB20';
-- TB21 · nguồn: https://toboki.vn/san-pham/21 ; https://meta.vn/may-rua-xe-cao-ap-toboki-tok7500-p97291
UPDATE san_pham SET cong_suat_w = 7500, dien_ap_v = 380, trong_luong_kg = 90, thong_so = '{"Áp lực":"250 bar","Chiều dài dây":"15 m","Nguồn điện":"3 pha","Kích thước":"72 x 40 x 52 cm","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB21';
-- TB22 · nguồn: https://meta.vn/may-dam-ga-toboki-tk-35-p97512
UPDATE san_pham SET cong_suat_w = 1100, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Tốc độ":"4000 vòng/phút","Biên độ":"1,2 mm","Trọng lượng bao bì":"3 kg","Xuất xứ":"Trung Quốc","Bảo hành":"6 tháng"}'::jsonb WHERE ma_sp = 'TB22';
-- TB23 · nguồn: https://toboki.vn/san-pham/50 ; https://meta.vn/may-dam-toboki-tk-45-p103844
UPDATE san_pham SET cong_suat_w = 1100, dien_ap_v = 220, trong_luong_kg = 2.7, thong_so = '{"Lõi mô tơ":"Dây đồng","Phụ kiện":"Chưa kèm dây đầm","Xuất xứ":"Trung Quốc","Bảo hành":"6 tháng"}'::jsonb WHERE ma_sp = 'TB23';
-- TB24 · nguồn: https://toboki.vn/san-pham/47 ; https://meta.vn/may-dam-dui-toboki-dr-1100-p97510
UPDATE san_pham SET cong_suat_w = 1100, dien_ap_v = 220, trong_luong_kg = 11.5, thong_so = '{"Tốc độ":"2840 vòng/phút","Động cơ":"1 pha, dây đồng","Kích thước":"40,5 x 25,5 x 33 cm","Xuất xứ":"Trung Quốc","Bảo hành":"6 tháng"}'::jsonb WHERE ma_sp = 'TB24';
-- TB25 · nguồn: https://toboki.vn/san-pham/49 ; https://meta.vn/may-dam-dui-toboki-dr-2500-p118335
UPDATE san_pham SET cong_suat_w = 2500, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Động cơ":"1 pha, dây đồng","Phụ kiện":"Chưa kèm dây đầm","Xuất xứ":"Trung Quốc","Bảo hành":"6 tháng"}'::jsonb WHERE ma_sp = 'TB25';
-- TB26 · nguồn: https://toboki.vn/san-pham/54 ; https://toboki.vn/san-pham/55 ; https://meta.vn/day-dam-ga-toboki-p113845
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = NULL, thong_so = '{"Chiều dài":"1,2 m / 1,5 m","Đường kính":"35 mm","Dùng cho":"Máy đầm gà Toboki TK-35","Xuất xứ":"Trung Quốc"}'::jsonb WHERE ma_sp = 'TB26';
-- TB27 · nguồn: https://meta.vn/day-dam-toboki-p97513
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = NULL, thong_so = '{"Chiều dài":"4 m / 6 m","Đường kính":"35 mm / 50 mm","Tần số rung":"200–225 Hz","Hiệu suất đầm":"8–20 m³/h","Xuất xứ":"Trung Quốc"}'::jsonb WHERE ma_sp = 'TB27';
-- TB28 · nguồn: https://toboki.vn/san-pham/98 ; https://meta.vn/may-khoan-ban-toboki-tk-13kb-p98102
UPDATE san_pham SET cong_suat_w = 375, dien_ap_v = 220, trong_luong_kg = NULL, thong_so = '{"Đường kính mũi khoan":"1,5–13 mm","Tốc độ":"620–2620 vòng/phút (5 cấp)","Hành trình mâm":"230 mm","Chiều cao máy":"60 cm","Bảo hành":"12 tháng"}'::jsonb WHERE ma_sp = 'TB28';
-- TB29 · nguồn: ten_sp
UPDATE san_pham SET cong_suat_w = 750, dien_ap_v = NULL, trong_luong_kg = NULL, thong_so = '{}'::jsonb WHERE ma_sp = 'TB29';
-- TB30 · nguồn: ten_sp
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = NULL, thong_so = '{"Dung tích bình":"2 L"}'::jsonb WHERE ma_sp = 'TB30';
-- TB31 · nguồn: ten_sp
UPDATE san_pham SET cong_suat_w = NULL, dien_ap_v = NULL, trong_luong_kg = NULL, thong_so = '{"Đường kính bàn xoa":"600 mm"}'::jsonb WHERE ma_sp = 'TB31';
