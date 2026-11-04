package phanphoi.server.db;

import java.sql.SQLException;

/**
 * Migration cộng thêm, chạy lại được: thông số kỹ thuật của mặt hàng. Ba trường số đi xuống chi nhánh qua SPECS;
 * thong_so (tối đa 10 cặp tự do) chỉ dùng ở admin và trên hóa đơn.
 */
public final class SpecSchema {
    private SpecSchema() { }

    public static void ensure(Db db) throws SQLException {
        db.tx(c -> {
            Db.update(c, "ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS cong_suat_w INTEGER CHECK (cong_suat_w BETWEEN 1 AND 100000)");
            Db.update(c, "ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS dien_ap_v INTEGER CHECK (dien_ap_v BETWEEN 1 AND 1000)");
            Db.update(c, "ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS trong_luong_kg NUMERIC(7,1) CHECK (trong_luong_kg > 0)");
            Db.update(c, "ALTER TABLE san_pham ADD COLUMN IF NOT EXISTS thong_so JSONB NOT NULL DEFAULT '{}'::jsonb");
            return null;
        });
    }
}
