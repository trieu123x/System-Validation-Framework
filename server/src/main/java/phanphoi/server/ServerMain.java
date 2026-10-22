package phanphoi.server;

import phanphoi.common.Config;
import phanphoi.common.Protocol;
import phanphoi.server.db.Db;
import phanphoi.server.net.DiscoveryResponder;
import phanphoi.server.net.BioServer;
import phanphoi.server.net.NetServer;
import phanphoi.server.net.NioServer;

import java.awt.Desktop;
import java.net.URI;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Server công ty. Chạy: java -jar server/target/server.jar [--config=config/server.properties] [key=value...]
 */
public final class ServerMain {

    public static void main(String[] args) throws Exception {
        Config cfg = Config.load("config/server.properties", args);
        int tcpPort = cfg.getInt("tcp.port", Protocol.DEFAULT_TCP_PORT);
        int udpPort = cfg.getInt("discovery.port", Protocol.DEFAULT_DISCOVERY_PORT);
        String adminHost = cfg.get("admin.http.host", "127.0.0.1");
        int adminPort = cfg.getInt("admin.http.port", 8080);
        int maxClients = cfg.getInt("max.clients", 100);

        Db db = new Db(
                cfg.get("db.url", "jdbc:postgresql://127.0.0.1:5432/phan_phoi_hang"),
                cfg.get("db.user", "postgres"),
                cfg.get("db.password", ""),
                cfg.getInt("db.pool.size", 20));
        db.read(c -> c.isValid(3)); // báo lỗi sớm nếu sai thông tin CSDL
        System.out.println("[server] da ket noi CSDL");

        ServerSettings settings = new ServerSettings(cfg);
        ServerContext ctx = new ServerContext(db, settings, cfg.getBool("log.quiet", false));
        long idleMs = cfg.getInt("heartbeat.idle.seconds", 30) * 1000L;
        long pongMs = cfg.getInt("heartbeat.pong.timeout.seconds", 10) * 1000L;
        NetServer tcp = settings.ioMode == ServerSettings.IoMode.NIO
                ? new NioServer(ctx, tcpPort, maxClients, idleMs, pongMs, cfg.getInt("nio.workers", 16),
                        cfg.getBool("nio.write.through", true))
                : new BioServer(ctx, tcpPort, maxClients, idleMs, pongMs);
        tcp.start();
        System.out.println("[server] cau hinh: " + settings.toMap());

        DiscoveryResponder discovery = new DiscoveryResponder(udpPort, tcpPort, ctx.security());
        if (cfg.getBool("discovery.enabled", true)) {
            discovery.start();
        }

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("tcpPort", tcpPort);
        info.put("discoveryPort", udpPort);
        info.put("maxClients", maxClients);
        AdminAuth auth = new AdminAuth(cfg);
        if (auth.usesDefaultPassword()) {
            System.out.println("[server] dang nhap cong ty: " + auth.user() + " / mat khau mac dinh admin123"
                    + " (doi bang admin.password.hash trong server.properties)");
        }
        AdminApi admin = new AdminApi(ctx, adminHost, adminPort, Path.of(cfg.get("ui.dir", "ui/out")), info,
                cfg.getBool("experiment.api", true), auth);
        admin.start();
        String url = "http://" + ("0.0.0.0".equals(adminHost) ? "localhost" : adminHost) + ":" + adminPort + "/admin/";
        System.out.println("[server] giao dien admin: " + url);
        System.out.println("[server] san sang");

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("[server] dang tat...");
            admin.close();
            discovery.close();
            try {
                tcp.close();
                ctx.log().close();
                ctx.securityLog().close();
            } catch (Exception ignored) {
                // đang tắt
            }
            db.close();
        }, "shutdown"));

        if (cfg.getBool("open.browser", true) && Desktop.isDesktopSupported()
                && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
            try {
                Desktop.getDesktop().browse(URI.create(url));
            } catch (Exception ignored) {
                // không mở được trình duyệt thì người dùng tự mở
            }
        }
    }
}
