package phanphoi.common;

/** Tin nhắn không tách được theo SRS 4.1; luôn ứng với ERROR|E01. */
public class ProtocolException extends Exception {
    public ProtocolException(String message) {
        super(message);
    }
}
