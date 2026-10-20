package phanphoi.server.net;

import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;

/**
 * SRS 7.2-A: client gửi UDP broadcast "DISCOVER" tới cổng 5001,
 * server trả "HERE|ip|cổngTCP" để client không cần nhập IP.
 */
public final class DiscoveryResponder implements AutoCloseable {

    private final int udpPort;
    private final int tcpPort;
    private DatagramSocket socket;

    public DiscoveryResponder(int udpPort, int tcpPort) {
        this.udpPort = udpPort;
        this.tcpPort = tcpPort;
    }

    public void start() throws SocketException {
        socket = new DatagramSocket(null);
        socket.setReuseAddress(true);
        socket.setBroadcast(true);
        socket.bind(new InetSocketAddress(udpPort));
        Thread t = new Thread(this::loop, "udp-discovery");
        t.setDaemon(true);
        t.start();
        System.out.println("[server] UDP discovery lang nghe cong " + udpPort);
    }

    private void loop() {
        byte[] buf = new byte[512];
        while (!socket.isClosed()) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                socket.receive(p);
                String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).trim();
                Message m;
                try {
                    m = Protocol.decode(text);
                } catch (ProtocolException e) {
                    continue;
                }
                if (m.command() != Command.DISCOVER) {
                    continue;
                }
                String ip = localAddressFor(p.getAddress());
                byte[] reply = Protocol.encode(Command.HERE, ip, tcpPort).getBytes(StandardCharsets.UTF_8);
                socket.send(new DatagramPacket(reply, reply.length, p.getSocketAddress()));
            } catch (IOException e) {
                if (!socket.isClosed()) {
                    System.err.println("[server] loi UDP: " + e.getMessage());
                }
            }
        }
    }

    /** Chọn IP của server cùng mạng con với client hỏi. */
    private static String localAddressFor(InetAddress client) {
        try {
            Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
            byte[] c = client.getAddress();
            String fallback = null;
            while (nics.hasMoreElements()) {
                NetworkInterface nic = nics.nextElement();
                if (!nic.isUp()) {
                    continue;
                }
                for (var ia : nic.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a.getAddress().length != 4) {
                        continue;
                    }
                    if (client.isLoopbackAddress() && a.isLoopbackAddress()) {
                        return a.getHostAddress();
                    }
                    if (sameSubnet(a.getAddress(), c, ia.getNetworkPrefixLength())) {
                        return a.getHostAddress();
                    }
                    if (!a.isLoopbackAddress() && fallback == null) {
                        fallback = a.getHostAddress();
                    }
                }
            }
            return fallback != null ? fallback : InetAddress.getLocalHost().getHostAddress();
        } catch (IOException e) {
            return "127.0.0.1";
        }
    }

    private static boolean sameSubnet(byte[] a, byte[] b, int prefix) {
        if (b.length != 4) {
            return false;
        }
        int ia = java.nio.ByteBuffer.wrap(a).getInt();
        int ib = java.nio.ByteBuffer.wrap(b).getInt();
        int mask = prefix == 0 ? 0 : -1 << (32 - prefix);
        return (ia & mask) == (ib & mask);
    }

    @Override
    public void close() {
        if (socket != null) {
            socket.close();
        }
    }
}
