package phanphoi.client;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** SRS 7.2-A: tìm server trong LAN bằng UDP broadcast DISCOVER → HERE|ip|cổng. */
public final class Discovery {

    private Discovery() {
    }

    /** Sau HERE đầu tiên chờ thêm chừng này để bắt các HERE khác (phát hiện server giả mạo). */
    private static final int EXTRA_MS = 300;

    /**
     * Một gói HERE: địa chỉ TCP server báo, và máy đã gửi gói (nguồn UDP). {@code local} = gói đến từ chính máy này
     * (loopback hoặc một địa chỉ của card mạng máy này): server cùng máy trả lời cả qua 127.0.0.1 lẫn IP LAN,
     * nên các HERE "local" là cùng một server, không phải giả mạo.
     */
    public record Here(InetSocketAddress server, String source, boolean local) {
    }

    /** @return địa chỉ TCP của server, hoặc null nếu không ai trả lời trong timeoutMs. */
    public static InetSocketAddress find(int udpPort, int timeoutMs) {
        List<Here> all = findAll(udpPort, timeoutMs);
        return all.isEmpty() ? null : all.get(0).server();
    }

    /** Địa chỉ thuộc chính máy này (loopback hoặc của một card mạng). */
    public static boolean isLocal(InetAddress a) {
        try {
            return a.isLoopbackAddress() || a.isAnyLocalAddress() || NetworkInterface.getByInetAddress(a) != null;
        } catch (IOException e) {
            return false;
        }
    }

    /** @return mọi HERE nhận được, theo thứ tự đến (trùng địa chỉ server thì giữ lần đầu); rỗng nếu không ai trả lời. */
    public static List<Here> findAll(int udpPort, int timeoutMs) {
        List<Here> found = new ArrayList<>();
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            byte[] req = Protocol.encode(Command.DISCOVER).getBytes(StandardCharsets.UTF_8);
            for (InetAddress target : broadcastTargets()) {
                try {
                    s.send(new DatagramPacket(req, req.length, target, udpPort));
                } catch (IOException ignored) {
                    // card mạng không gửi broadcast được: thử card khác
                }
            }
            byte[] buf = new byte[512];
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (true) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) {
                    break;
                }
                s.setSoTimeout((int) left);
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    s.receive(p);
                } catch (SocketTimeoutException e) {
                    break;
                }
                try {
                    Message m = Protocol.decode(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).trim());
                    if (m.command() == Command.HERE) {
                        InetSocketAddress a = new InetSocketAddress(m.param(0), m.intParam(1));
                        if (found.isEmpty()) {
                            deadline = Math.min(deadline, System.currentTimeMillis() + EXTRA_MS);
                        }
                        if (found.stream().noneMatch(h -> h.server().equals(a))) {
                            found.add(new Here(a, p.getAddress().getHostAddress(), isLocal(p.getAddress())));
                        }
                    }
                } catch (ProtocolException ignored) {
                    // gói lạ: bỏ qua
                }
            }
        } catch (IOException e) {
            System.err.println("[client] loi UDP discovery: " + e.getMessage());
        }
        return found;
    }

    private static Set<InetAddress> broadcastTargets() throws IOException {
        Set<InetAddress> out = new LinkedHashSet<>();
        out.add(InetAddress.getByName("255.255.255.255"));
        Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
        while (nics.hasMoreElements()) {
            NetworkInterface nic = nics.nextElement();
            if (!nic.isUp()) {
                continue;
            }
            for (InterfaceAddress ia : nic.getInterfaceAddresses()) {
                if (ia.getBroadcast() != null) {
                    out.add(ia.getBroadcast());
                }
            }
            if (nic.isLoopback()) {
                out.add(InetAddress.getLoopbackAddress());
            }
        }
        return out;
    }
}
