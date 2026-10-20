package phanphoi.server.net;

import phanphoi.common.LineSplitter;
import phanphoi.server.ServerContext;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.StandardSocketOptions;
import java.nio.ByteBuffer;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.ServerSocketChannel;
import java.nio.channels.SocketChannel;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Server không chặn (Java NIO): MỘT luồng Selector làm toàn bộ accept/đọc/ghi cho mọi kết nối,
 * nghiệp vụ (có truy cập CSDL) chạy trên worker pool cố định.
 *
 * <ul>
 *   <li>Số luồng không tăng theo số client (BIO cần 1–2 luồng mỗi kết nối).</li>
 *   <li>Mỗi kết nối có hàng đợi tuần tự trên worker pool → các dòng của cùng kết nối xử lý đúng thứ tự,
 *       các kết nối khác nhau xử lý song song.</li>
 *   <li>Ghi: khi kết nối không còn tin chờ, luồng gọi ghi thẳng vào socket (không chặn vì channel ở chế độ
 *       non-blocking); phần chưa ghi hết mới giao cho Selector qua OP_WRITE. Baseline nio.write.through=false:
 *       mọi tin đều xếp hàng rồi đánh thức Selector, nên ở ~10 000 tin/giây luồng Selector thành nút cổ chai (E7).
 *       Client đọc chậm làm hàng đợi vượt giới hạn thì bị cắt, không chặn ai.</li>
 * </ul>
 */
public final class NioServer extends NetServer {

    private final ExecutorService workers;
    private final int workerCount;
    private final boolean writeThrough;
    private final Queue<Runnable> selectorTasks = new ConcurrentLinkedQueue<>();
    private Selector selector;
    private ServerSocketChannel server;
    private volatile boolean running;

    public NioServer(ServerContext ctx, int port, int maxClients, long idleMs, long pongTimeoutMs, int workerCount,
                     boolean writeThrough) {
        super(ctx, port, maxClients, idleMs, pongTimeoutMs);
        this.workerCount = workerCount;
        this.writeThrough = writeThrough;
        AtomicInteger n = new AtomicInteger();
        this.workers = Executors.newFixedThreadPool(workerCount, r -> {
            Thread t = new Thread(r, "nio-worker-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }

    @Override
    protected void bind() throws IOException {
        selector = Selector.open();
        server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(port), 1000);
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);
        running = true;
        Thread t = new Thread(this::loop, "nio-selector");
        t.start();
        System.out.println("[server] TCP (NIO, 1 selector + " + workerCount + " worker, ghi "
                + (writeThrough ? "thang" : "qua selector") + ") lang nghe cong " + port);
    }

    private void loop() {
        while (running) {
            try {
                selector.select(500);
                Runnable task;
                while ((task = selectorTasks.poll()) != null) {
                    task.run();
                }
                Iterator<SelectionKey> it = selector.selectedKeys().iterator();
                while (it.hasNext()) {
                    SelectionKey key = it.next();
                    it.remove();
                    if (!key.isValid()) {
                        continue;
                    }
                    if (key.isAcceptable()) {
                        accept();
                        continue;
                    }
                    Conn c = (Conn) key.attachment();
                    try {
                        if (key.isReadable()) {
                            c.read();
                        }
                        if (key.isValid() && key.isWritable()) {
                            c.flush();
                        }
                    } catch (IOException | RuntimeException e) {
                        c.close();
                    }
                }
            } catch (IOException e) {
                if (running) {
                    System.err.println("[server] loi selector: " + e.getMessage());
                }
            }
        }
    }

    private void accept() throws IOException {
        SocketChannel ch;
        while ((ch = server.accept()) != null) {
            if (ctx.registry().connections().size() >= maxClients) {
                try (SocketChannel rejected = ch) {
                    rejected.write(ByteBuffer.wrap(ClientHandler.serverFullLine(maxClients)));
                }
                continue;
            }
            ch.configureBlocking(false);
            ch.setOption(StandardSocketOptions.TCP_NODELAY, true);
            ch.setOption(StandardSocketOptions.SO_KEEPALIVE, true);
            Conn c = new Conn(ch);
            c.key = ch.register(selector, SelectionKey.OP_READ, c);
            c.handler.onOpen();
        }
    }

    @Override
    public void close() throws IOException {
        super.close();
        running = false;
        if (selector != null) {
            selector.wakeup();
        }
        if (server != null) {
            server.close();
        }
        workers.shutdownNow();
    }

    /** Một kết nối NIO. Mọi thao tác với channel/key chạy trên luồng Selector. */
    private final class Conn implements Transport {
        private final SocketChannel ch;
        private final String remote;
        private final ClientHandler handler;
        private final LineSplitter splitter = new LineSplitter();
        private final ByteBuffer readBuf = ByteBuffer.allocate(8192);
        private final Queue<ByteBuffer> out = new ConcurrentLinkedQueue<>();
        private final AtomicInteger pending = new AtomicInteger();
        private final AtomicBoolean writeScheduled = new AtomicBoolean();
        private final AtomicBoolean closed = new AtomicBoolean();
        private final SerialExecutor serial = new SerialExecutor(workers);
        private SelectionKey key;

        Conn(SocketChannel ch) throws IOException {
            this.ch = ch;
            this.remote = String.valueOf(ch.getRemoteAddress());
            this.handler = new ClientHandler(ctx, this);
        }

        void read() throws IOException {
            int n = ch.read(readBuf);
            if (n < 0) {
                close();
                return;
            }
            readBuf.flip();
            splitter.feed(readBuf, line -> serial.execute(() -> handler.onLine(line)));
            readBuf.clear();
        }

        void flush() throws IOException {
            ByteBuffer b;
            while ((b = out.peek()) != null) {
                ch.write(b);
                if (b.hasRemaining()) {
                    return; // bộ đệm TCP đầy: chờ OP_WRITE lần sau
                }
                out.poll();
                pending.decrementAndGet();
            }
            key.interestOps(SelectionKey.OP_READ);
            writeScheduled.set(false);
            // tin mới có thể vừa được thêm sau khi vòng while kết thúc
            if (!out.isEmpty() && writeScheduled.compareAndSet(false, true)) {
                key.interestOps(SelectionKey.OP_READ | SelectionKey.OP_WRITE);
            }
        }

        @Override
        public boolean write(byte[] line) {
            if (closed.get()) {
                return false;
            }
            if (pending.incrementAndGet() > ctx.settings().sendQueueLimit) {
                System.err.println("[server] " + remote + " doc qua cham, cat ket noi");
                close();
                return false;
            }
            out.add(ByteBuffer.wrap(line));
            // writeScheduled = quyền ghi độc quyền: bên nào CAS được thì bên đó ghi, nên không có hai luồng
            // cùng ghi một channel
            if (writeScheduled.compareAndSet(false, true)) {
                if (writeThrough && writeNow()) {
                    return true;
                }
                selectorTasks.add(() -> {
                    if (key.isValid()) {
                        key.interestOps(SelectionKey.OP_READ | SelectionKey.OP_WRITE);
                    }
                });
                selector.wakeup();
            }
            return true;
        }

        /**
         * Ghi hàng đợi ngay trên luồng gọi. @return true nếu đã ghi hết và trả quyền ghi;
         * false nếu bộ đệm TCP đầy, khi đó vẫn giữ quyền ghi để giao cho Selector.
         */
        private boolean writeNow() {
            try {
                while (true) {
                    ByteBuffer b;
                    while ((b = out.peek()) != null) {
                        ch.write(b);
                        if (b.hasRemaining()) {
                            return false;
                        }
                        out.poll();
                        pending.decrementAndGet();
                    }
                    writeScheduled.set(false);
                    // tin mới có thể vừa được thêm bởi luồng khác sau vòng while
                    if (out.isEmpty() || !writeScheduled.compareAndSet(false, true)) {
                        return true;
                    }
                }
            } catch (IOException e) {
                close();
                return true;
            }
        }

        @Override
        public void close() {
            if (!closed.compareAndSet(false, true)) {
                return;
            }
            selectorTasks.add(() -> {
                key.cancel();
                try {
                    ch.close();
                } catch (IOException ignored) {
                    // đã đóng
                }
            });
            selector.wakeup();
            // chạy sau các dòng đã nhận của kết nối này
            serial.execute(handler::onClosed);
        }

        @Override
        public String remote() {
            return remote;
        }
    }

    /** Chạy các tác vụ của một kết nối lần lượt trên pool dùng chung. */
    private static final class SerialExecutor {
        private final ExecutorService pool;
        private final ArrayDeque<Runnable> tasks = new ArrayDeque<>();
        private boolean running;

        SerialExecutor(ExecutorService pool) {
            this.pool = pool;
        }

        synchronized void execute(Runnable r) {
            tasks.add(r);
            if (!running) {
                running = true;
                pool.execute(this::drain);
            }
        }

        private void drain() {
            while (true) {
                Runnable r;
                synchronized (this) {
                    r = tasks.poll();
                    if (r == null) {
                        running = false;
                        return;
                    }
                }
                try {
                    r.run();
                } catch (RuntimeException e) {
                    e.printStackTrace();
                }
            }
        }
    }
}
