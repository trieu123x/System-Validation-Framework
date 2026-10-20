package phanphoi.server.net;

import phanphoi.server.Events;

import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

/** Các kết nối đang mở và phiên đã đăng nhập (mỗi chi nhánh tối đa một kết nối, SRS 2.4). */
public final class SessionRegistry {

    private final Set<ClientHandler> connections = ConcurrentHashMap.newKeySet();
    private final Map<String, ClientHandler> online = new ConcurrentHashMap<>();
    private final Events events;

    public SessionRegistry(Events events) {
        this.events = events;
    }

    void opened(ClientHandler h) {
        connections.add(h);
    }

    void closed(ClientHandler h) {
        connections.remove(h);
        String maCn = h.maCn();
        if (maCn != null && online.remove(maCn, h)) {
            publishBranches();
        }
    }

    /** @return false nếu mã CN đang có phiên khác. */
    boolean login(String maCn, ClientHandler h) {
        boolean ok = online.putIfAbsent(maCn, h) == null;
        if (ok) {
            publishBranches();
        }
        return ok;
    }

    void logout(String maCn, ClientHandler h) {
        if (online.remove(maCn, h)) {
            publishBranches();
        }
    }

    public ClientHandler get(String maCn) {
        return online.get(maCn);
    }

    public boolean isOnline(String maCn) {
        return online.containsKey(maCn);
    }

    public Set<String> onlineIds() {
        return new TreeSet<>(online.keySet());
    }

    public Set<ClientHandler> connections() {
        return connections;
    }

    private void publishBranches() {
        events.publish(Events.BRANCHES, Map.of("online", onlineIds()));
    }
}
