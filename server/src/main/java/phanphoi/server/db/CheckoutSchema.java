package phanphoi.server.db;

import java.sql.SQLException;

/** Additive migration; paid receipts retain the product names and prices at checkout. */
public final class CheckoutSchema {
    private CheckoutSchema() { }

    public static void ensure(Db db) throws SQLException {
        db.tx(c -> {
            Db.update(c, """
                    CREATE TABLE IF NOT EXISTS hoa_don_ban (
                        id VARCHAR(40) PRIMARY KEY,
                        ma_cn VARCHAR(10) NOT NULL REFERENCES chi_nhanh(ma_cn),
                        trang_thai VARCHAR(10) NOT NULL CHECK (trang_thai IN ('PENDING', 'PAID')),
                        noi_dung JSONB NOT NULL,
                        tao_luc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        thanh_toan_luc TIMESTAMPTZ
                    )""");
            Db.update(c, "CREATE INDEX IF NOT EXISTS idx_hoa_don_ban_cn ON hoa_don_ban (ma_cn, tao_luc DESC)");
            return null;
        });
    }
}
