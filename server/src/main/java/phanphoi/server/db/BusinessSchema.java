package phanphoi.server.db;

import java.sql.SQLException;

/** Nâng cấp cộng thêm cho thống kê kinh doanh: giá bán ra, chỉ tiêu tháng, index theo thời gian. Chạy lại không lỗi. */
public final class BusinessSchema {
    private BusinessSchema() { }

    public static void ensure(Db db) throws SQLException {
        db.tx(c -> {
            Db.update(c, "ALTER TABLE ban_hang ADD COLUMN IF NOT EXISTS don_gia NUMERIC(15,0) CHECK (don_gia >= 0)");
            Db.update(c, """
                    CREATE TABLE IF NOT EXISTS muc_tieu_doanh_so (
                        ma_cn    VARCHAR(10)   NOT NULL REFERENCES chi_nhanh(ma_cn),
                        thang    DATE          NOT NULL CHECK (thang = date_trunc('month', thang)::date),
                        so_tien  NUMERIC(15,0) NOT NULL CHECK (so_tien > 0),
                        PRIMARY KEY (ma_cn, thang)
                    )""");
            Db.update(c, "CREATE INDEX IF NOT EXISTS idx_phieu_xuat_thoi_gian ON phieu_xuat (thoi_gian)");
            Db.update(c, "CREATE INDEX IF NOT EXISTS idx_ban_hang_thoi_gian ON ban_hang (thoi_gian)");
            return null;
        });
    }
}
