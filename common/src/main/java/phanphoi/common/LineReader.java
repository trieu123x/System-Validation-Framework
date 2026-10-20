package phanphoi.common;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Đọc từng dòng UTF-8 với giới hạn {@link Protocol#MAX_LINE_BYTES}.
 * Dòng quá dài bị bỏ tới ký tự xuống dòng kế tiếp và trả về {@link #TOO_LONG}
 * để bên gọi trả ERROR|E01 mà không phải giữ cả dòng trong bộ nhớ.
 */
public final class LineReader {

    /** Giá trị trả về khi dòng vượt giới hạn (so sánh bằng ==). */
    public static final String TOO_LONG = new String("<too long>");

    private final InputStream in;
    private final byte[] buf = new byte[Protocol.MAX_LINE_BYTES];
    private final byte[] chunk = new byte[8192];
    private int chunkPos;
    private int chunkLen;

    public LineReader(InputStream in) {
        this.in = in;
    }

    /** @return dòng không gồm \n, {@link #TOO_LONG}, hoặc null khi hết luồng. */
    public String readLine() throws IOException {
        int len = 0;
        boolean overflow = false;
        while (true) {
            if (chunkPos >= chunkLen) {
                chunkLen = in.read(chunk);
                chunkPos = 0;
                if (chunkLen <= 0) {
                    chunkLen = 0;
                    if (len == 0 && !overflow) {
                        return null;
                    }
                    return overflow ? TOO_LONG : new String(buf, 0, len, StandardCharsets.UTF_8);
                }
            }
            byte b = chunk[chunkPos++];
            if (b == '\n') {
                if (overflow) {
                    return TOO_LONG;
                }
                if (len > 0 && buf[len - 1] == '\r') {
                    len--;
                }
                return new String(buf, 0, len, StandardCharsets.UTF_8);
            }
            if (overflow) {
                continue;
            }
            if (len >= buf.length) {
                overflow = true;
                continue;
            }
            buf[len++] = b;
        }
    }
}
