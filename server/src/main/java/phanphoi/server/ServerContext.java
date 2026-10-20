package phanphoi.server;

import phanphoi.server.db.Db;
import phanphoi.server.net.SessionRegistry;
import phanphoi.server.service.AuthService;
import phanphoi.server.service.Outbox;
import phanphoi.server.service.RequestService;
import phanphoi.server.service.StockService;
import phanphoi.server.service.TransferService;

/** Các thành phần dùng chung của server, truyền cho ClientHandler và API admin. */
public final class ServerContext {

    private final Db db;
    private final Events events;
    private final MessageLog log;
    private final SessionRegistry registry;
    private final Outbox outbox;
    private final AuthService auth;
    private final StockService stock;
    private final RequestService requests;
    private final TransferService transfers;
    private final ServerSettings settings;
    private final boolean quiet;

    public ServerContext(Db db, ServerSettings settings, boolean quiet) {
        this.db = db;
        this.settings = settings;
        this.quiet = quiet;
        this.events = new Events();
        this.log = new MessageLog(db, events);
        this.registry = new SessionRegistry(events);
        this.outbox = new Outbox(db, registry, settings);
        this.auth = new AuthService(db);
        this.stock = new StockService(db, events);
        this.transfers = new TransferService(db, registry, outbox, events);
        this.requests = new RequestService(db, outbox, events, transfers, settings);
        outbox.addResyncSource(requests::resync);
        outbox.addResyncSource(transfers::resync);
    }

    public ServerSettings settings() {
        return settings;
    }

    /** Tắt log từng lần đăng nhập ra console (khi giả lập hàng trăm client). */
    public boolean quiet() {
        return quiet;
    }

    public Db db() {
        return db;
    }

    public Events events() {
        return events;
    }

    public MessageLog log() {
        return log;
    }

    public SessionRegistry registry() {
        return registry;
    }

    public Outbox outbox() {
        return outbox;
    }

    public AuthService auth() {
        return auth;
    }

    public StockService stock() {
        return stock;
    }

    public RequestService requests() {
        return requests;
    }

    public TransferService transfers() {
        return transfers;
    }
}
