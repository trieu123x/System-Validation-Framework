package phanphoi.server.net;

import phanphoi.common.LineReader;
import phanphoi.server.ServerContext;
import phanphoi.server.ServerSettings.WriteMode;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Server chặn (blocking I/O): một luồng accept + thread pool, mỗi kết nối chiếm một luồng đọc (SRS 2.4).
 * Ghi ra socket theo {@link WriteMode}: DIRECT (baseline) hoặc QUEUED (thêm một luồng ghi mỗi kết nối).
 */
public final class BioServer extends NetServer {

    private final ExecutorService pool;
    private ServerSocket serverSocket;

    public BioServer(ServerContext ctx, int port, int maxClients, long idleMs, long pongTimeoutMs) {
        super(ctx, port, maxClients, idleMs, pongTimeoutMs);
        AtomicInteger n = new AtomicInteger();
        // số luồng bị chặn bởi maxClients ở acceptLoop
        this.pool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "client-handler-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }

    @Override
    protected void bind() throws IOException {
        serverSocket = new ServerSocket(port, 1000);
        Thread t = new Thread(this::acceptLoop, "tcp-accept");
        t.start();
        System.out.println("[server] TCP (BIO, ghi " + ctx.settings().writeMode + ") lang nghe cong " + port);
    }

    private void acceptLoop() {
        while (!serverSocket.isClosed()) {
            try {
                Socket s = serverSocket.accept();
                s.setTcpNoDelay(true);
                s.setKeepAlive(true);
                if (ctx.registry().connections().size() >= maxClients) {
                    // từ chối rõ ràng thay vì để client treo chờ luồng rảnh
                    try (s) {
                        s.getOutputStream().write(ClientHandler.serverFullLine(maxClients));
                    }
                    continue;
                }
                BioTransport t = ctx.settings().writeMode == WriteMode.QUEUED
                        ? new QueuedTransport(s, ctx.settings().sendQueueLimit)
                        : new DirectTransport(s);
                ClientHandler h = new ClientHandler(ctx, t);
                h.onOpen();
                pool.execute(() -> readLoop(s, h));
            } catch (IOException e) {
                if (!serverSocket.isClosed()) {
                    System.err.println("[server] loi accept: " + e.getMessage());
                }
            }
        }
    }

    private static void readLoop(Socket s, ClientHandler h) {
        try {
            LineReader reader = new LineReader(s.getInputStream());
            String line;
            while ((line = reader.readLine()) != null) {
                h.onLine(line);
            }
        } catch (IOException e) {
            // client mất kết nối hoặc server đã đóng socket
        } finally {
            try {
                s.close();
            } catch (IOException ignored) {
                // đã đóng
            }
            h.onClosed();
        }
    }

    @Override
    public void close() throws IOException {
        super.close();
        if (serverSocket != null) {
            serverSocket.close();
        }
        pool.shutdownNow();
    }

    // ---------------- transport ----------------

    private abstract static class BioTransport implements Transport {
        protected final Socket socket;
        protected final OutputStream out;
        private final String remote;
        protected final AtomicBoolean closed = new AtomicBoolean();

        BioTransport(Socket socket) throws IOException {
            this.socket = socket;
            this.out = new BufferedOutputStream(socket.getOutputStream());
            this.remote = socket.getRemoteSocketAddress().toString();
        }

        @Override
        public String remote() {
            return remote;
        }

        @Override
        public void close() {
            if (closed.compareAndSet(false, true)) {
                try {
                    socket.close(); // luồng đọc thoát → onClosed()
                } catch (IOException ignored) {
                    // đã đóng
                }
            }
        }
    }

    /** Baseline: ghi ngay trên luồng gọi; client không đọc → bộ đệm TCP đầy → luồng gọi bị chặn. */
    private static final class DirectTransport extends BioTransport {
        DirectTransport(Socket s) throws IOException {
            super(s);
        }

        @Override
        public boolean write(byte[] line) {
            if (closed.get()) {
                return false;
            }
            try {
                synchronized (out) {
                    out.write(line);
                    out.flush();
                }
                return true;
            } catch (IOException e) {
                close();
                return false;
            }
        }
    }

    /** Đề xuất: hàng đợi có giới hạn + luồng ghi riêng; bên gọi không bao giờ bị chặn. */
    private static final class QueuedTransport extends BioTransport {
        private static final byte[] POISON = new byte[0];
        private final BlockingQueue<byte[]> queue;

        QueuedTransport(Socket s, int limit) throws IOException {
            super(s);
            this.queue = new ArrayBlockingQueue<>(limit);
            Thread w = new Thread(this::writeLoop, "writer-" + s.getPort());
            w.setDaemon(true);
            w.start();
        }

        @Override
        public boolean write(byte[] line) {
            if (closed.get()) {
                return false;
            }
            if (!queue.offer(line)) {
                System.err.println("[server] " + remote() + " doc qua cham (" + queue.size() + " tin cho), cat ket noi");
                close();
                return false;
            }
            return true;
        }

        private void writeLoop() {
            try {
                while (!closed.get()) {
                    byte[] b = queue.take();
                    if (b == POISON) {
                        break;
                    }
                    out.write(b);
                    // gom các tin đang chờ vào một lần flush
                    byte[] more;
                    while ((more = queue.poll()) != null && more != POISON) {
                        out.write(more);
                    }
                    out.flush();
                    if (more == POISON) {
                        break;
                    }
                }
            } catch (IOException | InterruptedException e) {
                close();
            }
        }

        @Override
        public void close() {
            super.close(); // đóng socket: luồng ghi đang chặn cũng thoát
            queue.clear();
            queue.offer(POISON);
        }
    }
}
