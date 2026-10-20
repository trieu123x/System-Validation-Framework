package phanphoi.common;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Đọc file .properties (UTF-8), rồi file *.local.properties cạnh nó nếu có (ghi đè);
 * tham số dòng lệnh dạng key=value ghi đè cả hai.
 */
public final class Config {

    private final Properties props = new Properties();
    private final Path source;

    private Config(Path source) {
        this.source = source;
    }

    /**
     * @param defaultFile file mặc định khi không có tham số --config=...
     * @param args        tham số main(); "--config=duong/dan" và "key=value"
     */
    public static Config load(String defaultFile, String[] args) throws IOException {
        String file = defaultFile;
        for (String a : args) {
            if (a.startsWith("--config=")) {
                file = a.substring("--config=".length());
            }
        }
        Config cfg = new Config(Path.of(file).toAbsolutePath());
        cfg.read(cfg.source);
        // server.properties → server.local.properties: giá trị riêng của máy (mật khẩu CSDL...), không đưa lên git
        String name = cfg.source.getFileName().toString();
        if (name.endsWith(".properties")) {
            cfg.read(cfg.source.resolveSibling(name.replaceFirst("\\.properties$", ".local.properties")));
        }
        for (String a : args) {
            int eq = a.indexOf('=');
            if (!a.startsWith("--config=") && eq > 0) {
                cfg.props.setProperty(a.substring(0, eq).replaceFirst("^--", ""), a.substring(eq + 1));
            }
        }
        return cfg;
    }

    private void read(Path p) throws IOException {
        if (Files.exists(p)) {
            try (Reader r = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
                props.load(r);
            }
        }
    }

    public Path source() {
        return source;
    }

    public String get(String key, String def) {
        String v = props.getProperty(key);
        return v == null || v.isBlank() ? def : v.trim();
    }

    public int getInt(String key, int def) {
        String v = props.getProperty(key);
        return v == null || v.isBlank() ? def : Integer.parseInt(v.trim());
    }

    public boolean getBool(String key, boolean def) {
        String v = props.getProperty(key);
        return v == null || v.isBlank() ? def : Boolean.parseBoolean(v.trim());
    }
}
