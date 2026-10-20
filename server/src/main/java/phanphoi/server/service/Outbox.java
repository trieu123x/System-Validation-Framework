package phanphoi.server.service;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;
import phanphoi.server.ServerSettings;
import phanphoi.server.ServerSettings.Delivery;
import phanphoi.server.db.Db;
import phanphoi.server.net.ClientHandler;
import phanphoi.server.net.SessionRegistry;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Gửi push tới chi nhánh; CN offline thì xếp vào hang_doi_tin (FR-21).
 *
 * <p>Sau LOGIN_OK: gửi tin đã xếp hàng, rồi gửi lại trạng thái mọi YC/điều chuyển còn mở
 * (OFFER, OUT_OF_STOCK, DELIVERED, TRANSFER_REQ). Bước gửi lại lấy từ CSDL nên phủ cả trường hợp
 * rút dây mạng khi server chưa biết CN đã mất (tin ghi vào socket chết bị mất, NFR-04).
 * Tin trạng thái trong hàng đợi vì vậy được thay bằng bản mới nhất thay vì gửi bản cũ.
 *
 * <p>Chế độ so sánh (thực nghiệm E2): NONE = không xếp hàng, không gửi lại; QUEUE = chỉ hàng đợi như SRS.
 */
public final class Outbox {

    @FunctionalInterface
    public interface ResyncSource {
        List<Message> messagesFor(String maCn) throws SQLException;
    }

    private static final Set<Command> STATE_MESSAGES =
            EnumSet.of(Command.OFFER, Command.OUT_OF_STOCK, Command.DELIVERED, Command.TRANSFER_REQ);

    private final Db db;
    private final SessionRegistry registry;
    private final ServerSettings settings;
    private final List<ResyncSource> resyncSources = new CopyOnWriteArrayList<>();

    public Outbox(Db db, SessionRegistry registry, ServerSettings settings) {
        this.db = db;
        this.registry = registry;
        this.settings = settings;
    }

    public void addResyncSource(ResyncSource source) {
        resyncSources.add(source);
    }

    /** @return true nếu đã gửi ngay, false nếu đã xếp hàng chờ (hoặc bị bỏ ở chế độ baseline NONE). */
    public boolean send(String maCn, Message m) throws SQLException {
        ClientHandler h = registry.get(maCn);
        if (h != null && h.send(m)) {
            return true;
        }
        if (settings.delivery == Delivery.NONE) {
            return false;
        }
        db.read(c -> Db.update(c, "INSERT INTO hang_doi_tin (ma_cn, noi_dung) VALUES (?, ?)", maCn, m.toLine()));
        return false;
    }

    public void deliverOnLogin(String maCn, ClientHandler h) {
        Delivery mode = settings.delivery;
        if (mode == Delivery.NONE) {
            return;
        }
        boolean resync = mode == Delivery.QUEUE_RESYNC;
        try {
            record Pending(long id, String line) {
            }
            List<Pending> pending = db.read(c -> Db.list(c,
                    "SELECT id, noi_dung FROM hang_doi_tin WHERE ma_cn = ? AND NOT da_gui ORDER BY id",
                    rs -> new Pending(rs.getLong(1), rs.getString(2)), maCn));
            List<Long> done = new ArrayList<>();
            for (Pending p : pending) {
                Message m;
                try {
                    m = Protocol.decode(p.line);
                } catch (ProtocolException e) {
                    done.add(p.id);
                    continue;
                }
                if ((resync && STATE_MESSAGES.contains(m.command())) || h.send(m)) {
                    done.add(p.id);
                } else {
                    break;
                }
            }
            if (!done.isEmpty()) {
                db.read(c -> Db.update(c, "UPDATE hang_doi_tin SET da_gui = TRUE WHERE id = ANY (?)",
                        c.createArrayOf("bigint", done.toArray())));
            }
            if (!resync) {
                return;
            }
            for (ResyncSource source : resyncSources) {
                for (Message m : source.messagesFor(maCn)) {
                    if (!h.send(m)) {
                        return;
                    }
                }
            }
        } catch (SQLException e) {
            System.err.println("[server] loi gui tin cho " + maCn + ": " + e.getMessage());
        }
    }

    /** BROADCAST tới mọi chi nhánh (FR-22); CN offline nhận khi đăng nhập lại. */
    public int broadcast(String noiDung) throws SQLException {
        List<String> all = db.read(c -> Db.list(c, "SELECT ma_cn FROM chi_nhanh WHERE NOT gia_lap ORDER BY ma_cn",
                rs -> rs.getString(1)));
        Message m = Message.of(Command.BROADCAST, noiDung);
        int sent = 0;
        for (String cn : all) {
            if (send(cn, m)) {
                sent++;
            }
        }
        return sent;
    }
}
