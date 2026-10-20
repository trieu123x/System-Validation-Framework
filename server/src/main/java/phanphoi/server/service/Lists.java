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
        int budget = Protocol.MAX_LINE_BYTES - command.name().length() - 1;
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
        return Message.of(command, Protocol.encodeList(kept));
    }
}
