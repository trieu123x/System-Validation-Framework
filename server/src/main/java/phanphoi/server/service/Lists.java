package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Ghép danh sách vào một tin nhưng không vượt {@link Protocol#MAX_LINE_BYTES}; thừa thì cắt bớt bản ghi cuối. */
final class Lists {

    private Lists() {
    }

    static Message fit(Command command, List<? extends List<?>> records) {
        return fit(command, List.of(), records);
    }

    /** Như trên, danh sách là tham số cuối, đứng sau các tham số {@code head}. */
    static Message fit(Command command, List<?> head, List<? extends List<?>> records) {
        int budget = Protocol.MAX_LINE_BYTES - command.name().length() - 1;
        for (Object h : head) {
            budget -= Protocol.escape(String.valueOf(h)).getBytes(StandardCharsets.UTF_8).length + 1;
        }
        List<List<?>> kept = new ArrayList<>();
        int used = 0;
        for (List<?> r : records) {
            int size = Protocol.escape(Protocol.encodeList(List.of(r))).getBytes(StandardCharsets.UTF_8).length;
            int extra = kept.isEmpty() ? size : size + 1;
            if (used + extra > budget) {
                break;
            }
            kept.add(r);
            used += extra;
        }
        List<Object> params = new ArrayList<>(head);
        params.add(Protocol.encodeList(kept));
        return Message.of(command, params.toArray());
    }
}
