package phanphoi.client;

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

/**
 * Một kết nối TCP tới server, dùng chung cho request và push (SRS 2.4).
 * Luồng Listener riêng đọc tin; mọi I/O mạng nằm ngoài luồng giao diện (NFR-08).
 */
final class ServerLink {

    interface Handler {
        void onMessage(ServerLink link, Message m);

        void onBadLine(ServerLink link, String line, String error);

        void onClosed(ServerLink link);
    }

    private final Socket socket;
    private final OutputStream out;
    private final Handler handler;
    private final InetSocketAddress address;
    private volatile boolean closed;
    volatile long lastReadAt = System.currentTimeMillis();
    volatile long pongDeadline;

    private ServerLink(Socket socket, InetSocketAddress address, Handler handler) throws IOException {
        this.socket = socket;
        this.address = address;
        this.handler = handler;
        this.out = new BufferedOutputStream(socket.getOutputStream());
    }

    static ServerLink open(InetSocketAddress address, int timeoutMs, Handler handler) throws IOException {
        Socket s = new Socket();
        try {
            s.connect(address, timeoutMs);
            s.setTcpNoDelay(true);
            s.setKeepAlive(true);
        } catch (IOException e) {
            s.close();
            throw e;
        }
        ServerLink link = new ServerLink(s, address, handler);
        Thread t = new Thread(link::listen, "listener");
        t.setDaemon(true);
        t.start();
        return link;
    }

    InetSocketAddress address() {
        return address;
    }

    private void listen() {
        try {
            LineReader reader = new LineReader(socket.getInputStream());
            String line;
            while ((line = reader.readLine()) != null) {
                lastReadAt = System.currentTimeMillis();
                pongDeadline = 0;
                if (line == LineReader.TOO_LONG) {
                    handler.onBadLine(this, "", "Dong tin tu server qua dai");
                    continue;
                }
                Message m;
                try {
                    m = Protocol.decode(line);
                } catch (ProtocolException e) {
                    handler.onBadLine(this, line, e.getMessage());
                    continue;
                }
                handler.onMessage(this, m);
            }
        } catch (IOException e) {
            // mất kết nối
        } finally {
            close();
            handler.onClosed(this);
        }
    }

    boolean send(Message m) {
        if (closed) {
            return false;
        }
        byte[] bytes = (m.toLine() + "\n").getBytes(StandardCharsets.UTF_8);
        try {
            synchronized (out) {
                out.write(bytes);
                out.flush();
            }
            return true;
        } catch (IOException e) {
            close();
            return false;
        }
    }

    boolean isClosed() {
        return closed;
    }

    void close() {
        if (closed) {
            return;
        }
        closed = true;
        try {
            socket.close();
        } catch (IOException ignored) {
            // đã đóng
        }
    }
}
