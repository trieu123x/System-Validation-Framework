package phanphoi.common;

import java.util.List;

/** Một tin đã tách: lệnh + tham số đã bỏ escape. */
public record Message(Command command, List<String> params) {

    public Message {
        params = List.copyOf(params);
    }

    public static Message of(Command command, Object... params) {
        String[] values = new String[params.length];
        for (int i = 0; i < params.length; i++) {
            values[i] = params[i] == null ? "" : String.valueOf(params[i]);
        }
        return new Message(command, List.of(values));
    }

    public String param(int index) {
        return params.get(index);
    }

    /** Tham số số nguyên; không phải số → ProtocolException (E01). */
    public int intParam(int index) throws ProtocolException {
        try {
            return Integer.parseInt(params.get(index).trim());
        } catch (NumberFormatException e) {
            throw new ProtocolException("Tham so " + (index + 1) + " cua " + command + " phai la so nguyen");
        }
    }

    public List<List<String>> listParam(int index) throws ProtocolException {
        return Protocol.decodeList(params.get(index));
    }

    public String toLine() {
        return Protocol.encode(this);
    }

    @Override
    public String toString() {
        return toLine();
    }
}
