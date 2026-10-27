package phanphoi.server.net;

import phanphoi.server.ServerContext;

import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Server TCP: BIO ({@link BioServer}) hoặc NIO ({@link NioServer}), dùng chung bộ hẹn giờ heartbeat. */
public abstract class NetServer implements AutoCloseable {

    protected final ServerContext ctx;
    protected final int port;
    protected final int maxClients;
    private final long idleMs;
    private final long pongTimeoutMs;
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "heartbeat");
        t.setDaemon(true);
        return t;
    });

    protected NetServer(ServerContext ctx, int port, int maxClients, long idleMs, long pongTimeoutMs) {
        this.ctx = ctx;
        this.port = port;
        this.maxClients = maxClients;
        this.idleMs = idleMs;
        this.pongTimeoutMs = pongTimeoutMs;
    }

    public final void start() throws IOException {
        bind();
        heartbeat.scheduleAtFixedRate(this::checkHeartbeats, 1, 1, TimeUnit.SECONDS);
    }

    protected abstract void bind() throws IOException;

    /** FR-04: im lặng idleMs → PING; không có PONG sau pongTimeoutMs → đóng. */
    private void checkHeartbeats() {
        long now = System.currentTimeMillis();
        try {
            ctx.security().tick(now);
        } catch (RuntimeException e) {
            System.err.println("[server] loi giam sat an ninh: " + e.getMessage());
        }
        for (ClientHandler h : ctx.registry().connections()) {
            try {
                h.checkHeartbeat(now, idleMs, pongTimeoutMs);
            } catch (RuntimeException e) {
                System.err.println("[server] loi heartbeat: " + e.getMessage());
            }
        }
    }

    @Override
    public void close() throws IOException {
        heartbeat.shutdownNow();
        for (ClientHandler h : ctx.registry().connections()) {
            h.closeWithReason("SERVER_SHUTDOWN");
        }
    }
}
