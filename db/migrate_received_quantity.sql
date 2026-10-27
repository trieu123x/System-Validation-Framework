-- Chạy được nhiều lần, giữ nguyên dữ liệu. Server cũng tự áp dụng khi khởi động.
ALTER TABLE yeu_cau ADD COLUMN IF NOT EXISTS so_luong_nhan INTEGER CHECK (so_luong_nhan >= 0);
-- NULL ở giao dịch cũ: chưa thu thập số thực nhận, không giả lập số kiểm đếm.
