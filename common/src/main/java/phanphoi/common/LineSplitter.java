package phanphoi.common;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;

/**
 * Tách dòng cho I/O không chặn (NIO): nhận từng mảnh byte bất kỳ, phát ra từng dòng hoàn chỉnh.
 * Cùng quy tắc với {@link LineReader}: tối đa {@link Protocol#MAX_LINE_BYTES} byte, bỏ \r cuối dòng,
 * dòng quá dài phát ra {@link LineReader#TOO_LONG}.
 */
public final class LineSplitter {

    private final byte[] buf = new byte[Protocol.MAX_LINE_BYTES];
    private int len;
    private boolean overflow;

    /** Đọc hết dữ liệu còn lại trong {@code in} (đang ở chế độ đọc). */
    public void feed(ByteBuffer in, Consumer<String> onLine) {
        while (in.hasRemaining()) {
            byte b = in.get();
            if (b == '\n') {
                if (overflow) {
                    onLine.accept(LineReader.TOO_LONG);
                } else {
                    int n = len > 0 && buf[len - 1] == '\r' ? len - 1 : len;
                    onLine.accept(new String(buf, 0, n, StandardCharsets.UTF_8));
                }
                len = 0;
                overflow = false;
            } else if (!overflow) {
                if (len >= buf.length) {
                    overflow = true;
                } else {
                    buf[len++] = b;
                }
            }
        }
    }
}
