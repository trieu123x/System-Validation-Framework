package phanphoi.server.db;

import java.sql.SQLException;

/** Add the accepted/waiting-for-dispatch state without rewriting historical requests. */
public final class ReplenishmentSchema {
    private ReplenishmentSchema() { }

    public static void ensure(Db db) throws SQLException {
        db.tx(c -> {
            Db.update(c, "ALTER TABLE yeu_cau DROP CONSTRAINT IF EXISTS yeu_cau_trang_thai_check");
            Db.update(c, """
                    ALTER TABLE yeu_cau ADD CONSTRAINT yeu_cau_trang_thai_check
                    CHECK (trang_thai IN ('CHO', 'DA_DE_XUAT', 'DA_CHAP_NHAN', 'DA_GIAO',
                                         'HOAN_TAT', 'TU_CHOI', 'THIEU_HANG'))""");
            return null;
        });
    }
}
