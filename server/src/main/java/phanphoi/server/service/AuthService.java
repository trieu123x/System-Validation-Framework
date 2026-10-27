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

    public record Branch(String code, String name, boolean ambiguous) { }

    /** Accept branch code, exact branch name or email. Email shared by branches needs #CNxx. */
    public Branch verify(String login, String password) throws SQLException {
        String key = login == null ? "" : login.trim();
        String hint = "";
        if (key.contains("#")) {
            String[] parts = key.split("#", -1);
            if (parts.length != 2 || !parts[1].matches("(?i)CN[0-9]{1,4}")) {
                hash("dummy", password); return null;
            }
            key = parts[0].trim(); hint = parts[1].trim();
        }
        final String input = key, branchHint = hint;
        java.util.List<String[]> rows = db.read(c -> Db.list(c, """
                SELECT ma_cn, ten, mat_khau_hash, salt FROM chi_nhanh
                WHERE (LOWER(ma_cn) = LOWER(?) OR LOWER(ten) = LOWER(?)
                  OR (email IS NOT NULL AND LOWER(email) = LOWER(?)))
                AND (? = '' OR LOWER(ma_cn) = LOWER(?))
                ORDER BY ma_cn LIMIT 5
                """, rs -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)},
                input, input, input, branchHint, branchHint));
        if (rows.size() > 1) {
            hash("dummy", password);
            return new Branch("", "", true);
        }
        if (rows.isEmpty()) { hash("dummy", password); return null; }
        String[] row = rows.get(0);
        byte[] expected = row[2].getBytes(StandardCharsets.US_ASCII);
        byte[] actual = hash(row[3], password).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual) ? new Branch(row[0], row[1], false) : null;
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
