package phanphoi.server.service;

import phanphoi.server.db.Db;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.util.HexFormat;

/** NFR-06: mật khẩu lưu dạng hex(SHA-256(salt + matKhau)), giống db/seed.sql. */
public final class AuthService {

    private final Db db;

    public AuthService(Db db) {
        this.db = db;
    }

    /** @return tên chi nhánh nếu đúng, null nếu sai mã hoặc mật khẩu. */
    public String verify(String maCn, String matKhau) throws SQLException {
        String[] row = db.read(c -> Db.one(c,
                "SELECT ten, mat_khau_hash, salt FROM chi_nhanh WHERE ma_cn = ?",
                rs -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, maCn));
        if (row == null) {
            hash("dummy", matKhau); // giữ thời gian xử lý tương đương khi sai mã
            return null;
        }
        byte[] expected = row[1].getBytes(StandardCharsets.US_ASCII);
        byte[] actual = hash(row[2], matKhau).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual) ? row[0] : null;
    }

    public static String hash(String salt, String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest((salt + password).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String newSalt() {
        byte[] b = new byte[8];
        new SecureRandom().nextBytes(b);
        return HexFormat.of().formatHex(b);
    }
}
