package phanphoi.common;

import java.util.ArrayList;
import java.util.List;

/**
 * Giao thức dòng văn bản SRS mục 4, dùng chung cho server, client và trình giả lập tải.
 *
 * <pre>
 *   LENH|thamSo1|thamSo2...\n        (UTF-8, tối đa 4096 byte/dòng)
 *   escape tham số:  \\ = \   \p = |   \n = xuống dòng
 *   danh sách:       bản ghi ngăn bởi ;  trường ngăn bởi ,
 *   escape trường:   \\ = \   \c = ,   \s = ;
 * </pre>
 */
public final class Protocol {

    public static final int MAX_LINE_BYTES = 4096;
    public static final char SEPARATOR = '|';
    public static final char RECORD_SEPARATOR = ';';
    public static final char FIELD_SEPARATOR = ',';

    public static final int DEFAULT_TCP_PORT = 5000;
    public static final int DEFAULT_DISCOVERY_PORT = 5001;

    /** Lý do LOGIN_FAIL cố định để client phân biệt khi tự đăng nhập lại. */
    public static final String LOGIN_FAIL_WRONG = "Sai ma chi nhanh hoac mat khau";
    public static final String LOGIN_FAIL_ONLINE = "Ma chi nhanh dang online";

    private Protocol() {
    }

    // ---------- tham số ----------

    public static String escape(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '|' -> sb.append("\\p");
                case '\n' -> sb.append("\\n");
                case '\r' -> { } // bỏ CR để CRLF và LF hiển thị như nhau
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    public static String unescape(String value) throws ProtocolException {
        if (value.indexOf('\\') < 0) {
            return value;
        }
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c != '\\') {
                sb.append(c);
                continue;
            }
            if (i + 1 >= value.length()) {
                throw new ProtocolException("Escape bi cat o cuoi tham so");
            }
            char next = value.charAt(++i);
            switch (next) {
                case '\\' -> sb.append('\\');
                case 'p' -> sb.append('|');
                case 'n' -> sb.append('\n');
                default -> throw new ProtocolException("Escape khong hop le: \\" + next);
            }
        }
        return sb.toString();
    }

    // ---------- dòng tin ----------

    public static String encode(Command command, Object... params) {
        return encode(Message.of(command, params));
    }

    public static String encode(Message message) {
        StringBuilder sb = new StringBuilder(message.command().name());
        for (String p : message.params()) {
            sb.append(SEPARATOR).append(escape(p));
        }
        return sb.toString();
    }

    /** Tách một dòng (không gồm ký tự xuống dòng). Lỗi nào cũng ứng với E01. */
    public static Message decode(String line) throws ProtocolException {
        if (line == null) {
            throw new ProtocolException("Dong rong");
        }
        if (line.endsWith("\r")) {
            line = line.substring(0, line.length() - 1);
        }
        if (line.isBlank()) {
            throw new ProtocolException("Dong rong");
        }
        List<String> parts = split(line);
        String name = parts.get(0).trim();
        Command command = Command.of(name);
        if (command == null) {
            throw new ProtocolException("Lenh khong ton tai: " + abbreviate(name));
        }
        List<String> params = new ArrayList<>(parts.size() - 1);
        for (int i = 1; i < parts.size(); i++) {
            params.add(unescape(parts.get(i)));
        }
        if (params.size() != command.paramCount()) {
            throw new ProtocolException(command + " can " + command.paramCount()
                    + " tham so, nhan " + params.size());
        }
        return new Message(command, params);
    }

    private static List<String> split(String line) {
        List<String> parts = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < line.length(); i++) {
            if (line.charAt(i) == SEPARATOR) {
                parts.add(line.substring(start, i));
                start = i + 1;
            }
        }
        parts.add(line.substring(start));
        return parts;
    }

    // ---------- danh sách nhiều bản ghi ----------

    public static String encodeList(List<? extends List<?>> records) {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < records.size(); r++) {
            if (r > 0) {
                sb.append(RECORD_SEPARATOR);
            }
            List<?> fields = records.get(r);
            for (int f = 0; f < fields.size(); f++) {
                if (f > 0) {
                    sb.append(FIELD_SEPARATOR);
                }
                Object v = fields.get(f);
                sb.append(escapeField(v == null ? "" : String.valueOf(v)));
            }
        }
        return sb.toString();
    }

    public static List<List<String>> decodeList(String value) throws ProtocolException {
        List<List<String>> records = new ArrayList<>();
        if (value.isEmpty()) {
            return records;
        }
        List<String> fields = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\') {
                if (i + 1 >= value.length()) {
                    throw new ProtocolException("Escape bi cat o cuoi danh sach");
                }
                char next = value.charAt(++i);
                switch (next) {
                    case '\\' -> cur.append('\\');
                    case 'c' -> cur.append(',');
                    case 's' -> cur.append(';');
                    default -> throw new ProtocolException("Escape danh sach khong hop le: \\" + next);
                }
            } else if (c == FIELD_SEPARATOR) {
                fields.add(cur.toString());
                cur.setLength(0);
            } else if (c == RECORD_SEPARATOR) {
                fields.add(cur.toString());
                cur.setLength(0);
                records.add(fields);
                fields = new ArrayList<>();
            } else {
                cur.append(c);
            }
        }
        fields.add(cur.toString());
        records.add(fields);
        return records;
    }

    private static String escapeField(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 4);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case ',' -> sb.append("\\c");
                case ';' -> sb.append("\\s");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    private static String abbreviate(String s) {
        return s.length() <= 30 ? s : s.substring(0, 30) + "...";
    }
}
