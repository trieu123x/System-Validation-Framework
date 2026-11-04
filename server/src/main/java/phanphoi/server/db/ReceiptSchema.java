package phanphoi.server.db;

import java.sql.SQLException;

/** Nâng cấp cộng thêm cho cả CSDL đang chạy và CSDL mới. Không sửa giao dịch lịch sử. */
public final class ReceiptSchema {
    private ReceiptSchema() { }

    public static void ensure(Db db) throws SQLException {
        db.tx(c -> {
            Db.update(c, """
                    ALTER TABLE yeu_cau ADD COLUMN IF NOT EXISTS so_luong_nhan INTEGER
                    CHECK (so_luong_nhan >= 0)""");
            Db.update(c, "ALTER TABLE cong_no_cn DROP CONSTRAINT IF EXISTS cong_no_cn_loai_check");
            Db.update(c, """
                    ALTER TABLE cong_no_cn ADD CONSTRAINT cong_no_cn_loai_check
                    CHECK (loai IN ('XUAT', 'THU', 'DC_NHAN', 'DC_GIAO', 'TRA_NHAN', 'TRA_GIAO'))""");
            return null;
        });
    }
}
