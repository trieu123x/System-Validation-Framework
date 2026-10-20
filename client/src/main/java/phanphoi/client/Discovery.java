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
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.Set;

/** SRS 7.2-A: tìm server trong LAN bằng UDP broadcast DISCOVER → HERE|ip|cổng. */
public final class Discovery {

    private Discovery() {
    }

    /** @return địa chỉ TCP của server, hoặc null nếu không ai trả lời trong timeoutMs. */
    public static InetSocketAddress find(int udpPort, int timeoutMs) {
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            s.setSoTimeout(timeoutMs);
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
            while (System.currentTimeMillis() < deadline) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    s.receive(p);
                } catch (SocketTimeoutException e) {
                    return null;
                }
                try {
                    Message m = Protocol.decode(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).trim());
                    if (m.command() == Command.HERE) {
                        return new InetSocketAddress(m.param(0), m.intParam(1));
                    }
                } catch (ProtocolException ignored) {
                    // gói lạ: bỏ qua
                }
            }
        } catch (IOException e) {
            System.err.println("[client] loi UDP discovery: " + e.getMessage());
        }
        return null;
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
