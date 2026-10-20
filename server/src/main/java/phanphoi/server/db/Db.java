package phanphoi.server.db;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Pool kết nối JDBC + tiện ích transaction. Chỉ server truy cập CSDL (SRS 2). */
public final class Db implements AutoCloseable {

    @FunctionalInterface
    public interface Work<T> {
        T run(Connection c) throws SQLException;
    }

    @FunctionalInterface
    public interface RowMapper<T> {
        T map(ResultSet rs) throws SQLException;
    }

    public static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    private final HikariDataSource ds;

    public Db(String url, String user, String password, int poolSize) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(url);
        cfg.setUsername(user);
        cfg.setPassword(password);
        cfg.setMaximumPoolSize(poolSize);
        cfg.setPoolName("phanphoi");
        cfg.setConnectionTimeout(10_000);
        // gộp các INSERT theo lô thành INSERT nhiều dòng: nhật ký ghi kịp ~20 000 tin/giây (E7)
        cfg.addDataSourceProperty("reWriteBatchedInserts", "true");
        this.ds = new HikariDataSource(cfg);
    }

    /** Chạy trong một transaction; ngoại lệ bất kỳ → rollback. */
    public <T> T tx(Work<T> work) throws SQLException {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                T result = work.run(c);
                c.commit();
                return result;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    /** Chạy với auto-commit (đọc hoặc một câu lệnh đơn). */
    public <T> T read(Work<T> work) throws SQLException {
        try (Connection c = ds.getConnection()) {
            return work.run(c);
        }
    }

    @Override
    public void close() {
        ds.close();
    }

    // ---------- tiện ích truy vấn ----------

    public static PreparedStatement prepare(Connection c, String sql, Object... args) throws SQLException {
        PreparedStatement ps = c.prepareStatement(sql);
        for (int i = 0; i < args.length; i++) {
            ps.setObject(i + 1, args[i]);
        }
        return ps;
    }

    public static int update(Connection c, String sql, Object... args) throws SQLException {
        try (PreparedStatement ps = prepare(c, sql, args)) {
            return ps.executeUpdate();
        }
    }

    public static <T> List<T> list(Connection c, String sql, RowMapper<T> mapper, Object... args) throws SQLException {
        try (PreparedStatement ps = prepare(c, sql, args); ResultSet rs = ps.executeQuery()) {
            List<T> out = new ArrayList<>();
            while (rs.next()) {
                out.add(mapper.map(rs));
            }
            return out;
        }
    }

    /** Dòng đầu tiên hoặc null. */
    public static <T> T one(Connection c, String sql, RowMapper<T> mapper, Object... args) throws SQLException {
        try (PreparedStatement ps = prepare(c, sql, args); ResultSet rs = ps.executeQuery()) {
            return rs.next() ? mapper.map(rs) : null;
        }
    }

    /** Kết quả dạng Map với tên cột snake_case đổi sang camelCase, dùng trả JSON cho giao diện. */
    public static List<Map<String, Object>> rows(Connection c, String sql, Object... args) throws SQLException {
        return list(c, sql, Db::toMap, args);
    }

    public static Map<String, Object> toMap(ResultSet rs) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= md.getColumnCount(); i++) {
            Object v = rs.getObject(i);
            if (v instanceof Timestamp ts) {
                v = ts.toLocalDateTime().format(TIME_FORMAT);
            } else if (v instanceof BigDecimal bd) {
                v = bd.doubleValue();
            }
            row.put(camel(md.getColumnLabel(i)), v);
        }
        return row;
    }

    static String camel(String snake) {
        StringBuilder sb = new StringBuilder(snake.length());
        boolean upper = false;
        for (char ch : snake.toCharArray()) {
            if (ch == '_') {
                upper = true;
            } else {
                sb.append(upper ? Character.toUpperCase(ch) : ch);
                upper = false;
            }
        }
        return sb.toString();
    }
}
