package phanphoi.server.net;

/**
 * Lớp vận chuyển của một kết nối TCP. {@link ClientHandler} chỉ biết gửi dòng và đóng kết nối,
 * không quan tâm bên dưới là BIO (luồng riêng mỗi kết nối) hay NIO (Selector).
 */
public interface Transport {

    /**
     * Gửi một dòng đã kèm '\n'. Không được chặn lâu bên gọi (trừ chế độ baseline "direct").
     *
     * @return false nếu kết nối đã hỏng hoặc client đọc quá chậm và bị cắt
     */
    boolean write(byte[] line);

    /** Đóng kết nối; sau đó ClientHandler.onClosed() được gọi đúng một lần. */
    void close();

    String remote();
}
