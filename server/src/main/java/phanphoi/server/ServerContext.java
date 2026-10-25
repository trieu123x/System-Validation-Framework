package phanphoi.server;

import phanphoi.server.db.Db;
import phanphoi.server.mail.EmailNotifications;
import phanphoi.server.security.EventSink;
import phanphoi.server.security.SecurityEvent;
import phanphoi.server.net.SessionRegistry;
import phanphoi.server.security.SecurityEventLog;
import phanphoi.server.security.SecurityMonitor;
import phanphoi.server.service.AuthService;
import phanphoi.server.service.DebtService;
import phanphoi.server.service.NoticeService;
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
    private final DebtService debts;
    private final NoticeService notices;
    private final SecurityEventLog securityLog;
    private final SecurityMonitor security;
    private final ServerSettings settings;
    private final boolean quiet;
    private final EmailNotifications email;

    public ServerContext(Db db, ServerSettings settings, boolean quiet) {
        this(db, settings, quiet, EmailNotifications.disabled());
    }

    public ServerContext(Db db, ServerSettings settings, boolean quiet, EmailNotifications email) {
        this.db = db;
        this.settings = settings;
        this.quiet = quiet;
        this.email = email;
        this.events = new Events();
        this.log = new MessageLog(db, events);
        this.registry = new SessionRegistry(events);
        this.securityLog = new SecurityEventLog(db, events);
        this.security = new SecurityMonitor(settings.securityRules, () -> settings.securityMode, new EventSink() {
            @Override
            public void emit(SecurityEvent event) {
                securityLog.emit(event);
                email.onSecurityEvent(event);
            }

            @Override
            public long dropped() {
                return securityLog.dropped();
            }
        });
        this.outbox = new Outbox(db, registry, settings);
        this.auth = new AuthService(db);
        this.stock = new StockService(db, events);
        this.debts = new DebtService(db, registry, events);
        this.transfers = new TransferService(db, registry, outbox, events, debts);
        this.requests = new RequestService(db, outbox, events, transfers, debts, settings);
        outbox.addResyncSource(requests::resync);
        outbox.addResyncSource(transfers::resync);
        this.notices = new NoticeService(db, outbox, events, requests, email);
        outbox.addResyncSource(notices::resync);
    }

    public ServerSettings settings() {
        return settings;
    }

    public EmailNotifications email() {
        return email;
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

    public DebtService debts() {
        return debts;
    }

    public NoticeService notices() {
        return notices;
    }

    public SecurityMonitor security() {
        return security;
    }

    public SecurityEventLog securityLog() {
        return securityLog;
    }
}
