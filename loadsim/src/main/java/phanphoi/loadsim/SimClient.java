package phanphoi.loadsim;

import phanphoi.common.Command;
import phanphoi.common.LineReader;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Một chi nhánh ảo nói giao thức TCP thật với server (dùng chung Protocol với client.jar).
 * Luồng đọc riêng tự trả PONG; tin push đưa cho {@code onPush}, tin còn lại vào hàng đợi trả lời.
 */
final class SimClient implements AutoCloseable {

    final String id;
    private final String host;
    private final int port;
    private final String password;
    private Socket socket;
    private OutputStream out;
    private final BlockingQueue<Message> replies = new LinkedBlockingQueue<>();
    private volatile Consumer<Message> onPush = m -> { };
    /** Mô phỏng rút dây mạng: vẫn giữ socket nhưng mọi byte nhận được bị mất, không trả PONG. */
    volatile boolean dark;
    volatile boolean closedByPeer;
    /** Client treo: ngừng đọc socket để bộ đệm TCP đầy (thực nghiệm client chậm). */
    volatile boolean stall;
    private int receiveBuffer;

    SimClient(String id, String host, int port, String password) {
        this.id = id;
        this.host = host;
        this.port = port;
        this.password = password;
    }

    SimClient onPush(Consumer<Message> handler) {
        this.onPush = handler;
        return this;
    }

    /** Bộ đệm nhận nhỏ để client "treo" làm đầy TCP nhanh (thực nghiệm client chậm). */
    SimClient receiveBuffer(int bytes) {
        this.receiveBuffer = bytes;
        return this;
    }

    void connect(int timeoutMs) throws IOException {
        Socket s = new Socket();
        if (receiveBuffer > 0) {
            s.setReceiveBufferSize(receiveBuffer);
        }
        try {
            s.connect(new InetSocketAddress(host, port), timeoutMs);
        } catch (IOException e) {
            s.close();
            throw e;
        }
        s.setTcpNoDelay(true);
        socket = s;
        out = new BufferedOutputStream(s.getOutputStream());
        replies.clear();
        closedByPeer = false;
        dark = false;
    }

    /** Bắt đầu luồng đọc. readLines=false: không bao giờ đọc (client treo). */
    void startReader(boolean readLines) {
        if (!readLines) {
            return;
        }
        Socket s = socket;
        Thread t = new Thread(() -> readLoop(s), "sim-read-" + id);
        t.setDaemon(true);
        t.start();
    }

    private void readLoop(Socket s) {
        try {
            LineReader r = new LineReader(s.getInputStream());
            String line;
            while (true) {
                while (stall) {
                    Thread.sleep(50);
                }
                if ((line = r.readLine()) == null) {
                    break;
                }
                if (dark || line == LineReader.TOO_LONG) {
                    continue;
                }
                Message m;
                try {
                    m = Protocol.decode(line);
                } catch (ProtocolException e) {
                    continue;
                }
                switch (m.command()) {
                    case PING -> send(Message.of(Command.PONG));
                    case OFFER, BROADCAST, DELIVERED, OUT_OF_STOCK, TRANSFER_REQ -> {
                        onPush.accept(m);
                        if (m.command() == Command.DELIVERED || m.command() == Command.OUT_OF_STOCK) {
                            replies.add(m);
                        }
                    }
                    default -> replies.add(m);
                }
            }
        } catch (IOException ignored) {
            // kết thúc
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            if (s == socket) {
                closedByPeer = true;
            }
        }
    }

    /** Kết nối + LOGIN. @return LOGIN_OK/LOGIN_FAIL/ERROR, hoặc null nếu hết giờ. */
    Message login(int timeoutMs) throws IOException, InterruptedException {
        connect(timeoutMs);
        startReader(true);
        send(Message.of(Command.LOGIN, id, password));
        return await(timeoutMs, Command.LOGIN_OK, Command.LOGIN_FAIL, Command.ERROR);
    }

    void send(Message m) throws IOException {
        OutputStream o = out;
        synchronized (this) {
            o.write((m.toLine() + "\n").getBytes(StandardCharsets.UTF_8));
            o.flush();
        }
    }

    /** Chờ tin đầu tiên thuộc một trong các lệnh, bỏ qua tin khác. */
    Message await(long timeoutMs, Command... wanted) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (true) {
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) {
                return null;
            }
            Message m = replies.poll(left, TimeUnit.MILLISECONDS);
            if (m == null) {
                return null;
            }
            for (Command c : wanted) {
                if (m.command() == c) {
                    return m;
                }
            }
        }
    }

    boolean isOpen() {
        return socket != null && !socket.isClosed() && !closedByPeer;
    }

    /** Đóng đột ngột (không LOGOUT), như ứng dụng bị tắt. */
    void abort() {
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (IOException ignored) {
            // đã đóng
        }
    }

    @Override
    public void close() {
        try {
            if (isOpen()) {
                send(Message.of(Command.LOGOUT));
            }
        } catch (IOException ignored) {
            // đã đóng
        }
        abort();
    }
}
