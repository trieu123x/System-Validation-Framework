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
            return null;
        });
    }
}
