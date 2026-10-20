package phanphoi.loadsim;

import phanphoi.common.Command;
import phanphoi.common.Config;
import phanphoi.common.LineReader;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.ProtocolException;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * SRS 7.2-G / TC-11 / NFR-02: tạo N chi nhánh ảo bán hàng ngẫu nhiên, đo độ trễ SALE → SALE_OK,
 * đếm tin mất (không có trả lời trong 5 giây) và xuất CSV.
 *
 * <pre>
 * java -jar loadsim/target/loadsim.jar clients=20 duration=600 rate=1 server=127.0.0.1:5000
 *      prefix=SIM password=123456 out=loadsim-result.csv
 * </pre>
 * Tài khoản SIM001..SIM050 tạo bằng db/seed_loadsim.sql.
 */
public final class LoadSimulator {

    private record Sample(String client, int seq, long sentAtMs, double rttMs, String result) {
    }

    private static final long REPLY_TIMEOUT_MS = 5_000;

    private final String host;
    private final int port;
    private final String password;
    private final double rate;
    private final long endAt;
    private final ConcurrentLinkedQueue<Sample> samples = new ConcurrentLinkedQueue<>();
    private final AtomicInteger loginFailures = new AtomicInteger();
    private final AtomicInteger disconnects = new AtomicInteger();

    private LoadSimulator(String host, int port, String password, double rate, long endAt) {
        this.host = host;
        this.port = port;
        this.password = password;
        this.rate = rate;
        this.endAt = endAt;
    }

    public static void main(String[] args) throws Exception {
        Config cfg = Config.load("config/loadsim.properties", args);
        int clients = cfg.getInt("clients", 20);
        int duration = cfg.getInt("duration", 60);
        double rate = Double.parseDouble(cfg.get("rate", "1"));
        String server = cfg.get("server", "127.0.0.1:" + Protocol.DEFAULT_TCP_PORT);
        String prefix = cfg.get("prefix", "SIM");
        int start = cfg.getInt("start", 1);
        String password = cfg.get("password", "123456");
        Path out = Path.of(cfg.get("out", "loadsim-result.csv"));

        int colon = server.lastIndexOf(':');
        String host = colon > 0 ? server.substring(0, colon) : server;
        int port = colon > 0 ? Integer.parseInt(server.substring(colon + 1)) : Protocol.DEFAULT_TCP_PORT;

        System.out.printf("Gia lap %d chi nhanh, %.2f tin/giay moi chi nhanh, trong %d giay -> %s:%d%n",
                clients, rate, duration, host, port);
        LoadSimulator sim = new LoadSimulator(host, port, password, rate,
                System.currentTimeMillis() + duration * 1000L);
        CountDownLatch done = new CountDownLatch(clients);
        long t0 = System.currentTimeMillis();
        for (int i = 0; i < clients; i++) {
            String id = prefix + String.format("%03d", start + i);
            Thread t = new Thread(() -> {
                try {
                    sim.runClient(id);
                } finally {
                    done.countDown();
                }
            }, "sim-" + id);
            t.start();
            Thread.sleep(20); // rải đều các kết nối
        }
        Thread progress = new Thread(() -> {
            while (done.getCount() > 0) {
                try {
                    Thread.sleep(10_000);
                } catch (InterruptedException e) {
                    return;
                }
                System.out.printf("  ... %ds: %d tin da do%n", (System.currentTimeMillis() - t0) / 1000, sim.samples.size());
            }
        });
        progress.setDaemon(true);
        progress.start();
        done.await();
        sim.report(out, (System.currentTimeMillis() - t0) / 1000.0);
    }

    private void runClient(String id) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 5000);
            s.setTcpNoDelay(true);
            OutputStream out = new BufferedOutputStream(s.getOutputStream());
            BlockingQueue<Message> replies = new LinkedBlockingQueue<>();
            Thread reader = new Thread(() -> readLoop(s, out, replies), "sim-read-" + id);
            reader.setDaemon(true);
            reader.start();

            send(out, Message.of(Command.LOGIN, id, password));
            Message login = awaitAny(replies, REPLY_TIMEOUT_MS, Command.LOGIN_OK, Command.LOGIN_FAIL);
            if (login == null || login.command() != Command.LOGIN_OK) {
                loginFailures.incrementAndGet();
                System.err.println(id + ": dang nhap that bai " + (login == null ? "(timeout)" : login.param(0)));
                return;
            }
            send(out, Message.of(Command.INVENTORY_GET));
            Message inv = awaitAny(replies, REPLY_TIMEOUT_MS, Command.INVENTORY);
            List<String> products = new ArrayList<>();
            if (inv != null) {
                for (List<String> r : inv.listParam(0)) {
                    products.add(r.get(0));
                }
            }
            if (products.isEmpty()) {
                System.err.println(id + ": khong co mat hang nao");
                return;
            }
            long intervalMs = (long) (1000 / rate);
            int seq = 0;
            long next = System.currentTimeMillis() + ThreadLocalRandom.current().nextLong(intervalMs);
            while (System.currentTimeMillis() < endAt) {
                long wait = next - System.currentTimeMillis();
                if (wait > 0) {
                    Thread.sleep(wait);
                }
                next += intervalMs;
                String sp = products.get(ThreadLocalRandom.current().nextInt(products.size()));
                long sentMs = System.currentTimeMillis();
                long t = System.nanoTime();
                send(out, Message.of(Command.SALE, sp, 1));
                Message r = awaitAny(replies, REPLY_TIMEOUT_MS, Command.SALE_OK, Command.ERROR);
                double rtt = (System.nanoTime() - t) / 1e6;
                String result = r == null ? "LOST" : r.command() == Command.SALE_OK ? "OK" : "ERROR_" + r.param(0);
                samples.add(new Sample(id, ++seq, sentMs, r == null ? -1 : rtt, result));
                if (s.isClosed()) {
                    break;
                }
            }
            send(out, Message.of(Command.LOGOUT));
        } catch (IOException e) {
            disconnects.incrementAndGet();
            System.err.println(id + ": mat ket noi - " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (ProtocolException e) {
            System.err.println(id + ": tin sai dinh dang - " + e.getMessage());
        }
    }

    private static void readLoop(Socket s, OutputStream out, BlockingQueue<Message> replies) {
        try {
            LineReader r = new LineReader(s.getInputStream());
            String line;
            while ((line = r.readLine()) != null) {
                if (line == LineReader.TOO_LONG) {
                    continue;
                }
                Message m;
                try {
                    m = Protocol.decode(line);
                } catch (ProtocolException e) {
                    continue;
                }
                if (m.command() == Command.PING) {
                    send(out, Message.of(Command.PONG));
                } else {
                    replies.add(m);
                }
            }
        } catch (IOException ignored) {
            // kết thúc
        }
    }

    private static void send(OutputStream out, Message m) throws IOException {
        synchronized (out) {
            out.write((m.toLine() + "\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    /** Chờ tin thuộc một trong các lệnh; bỏ qua push không liên quan (BROADCAST, OFFER...). */
    private static Message awaitAny(BlockingQueue<Message> q, long timeoutMs, Command... wanted)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (true) {
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) {
                return null;
            }
            Message m = q.poll(left, TimeUnit.MILLISECONDS);
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

    private void report(Path out, double seconds) throws IOException {
        List<Sample> all = new ArrayList<>(samples);
        try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(out, StandardCharsets.UTF_8))) {
            w.println("chi_nhanh,stt,gui_luc_ms,do_tre_ms,ket_qua");
            for (Sample s : all) {
                w.printf(Locale.ROOT, "%s,%d,%d,%.3f,%s%n", s.client, s.seq, s.sentAtMs, s.rttMs, s.result);
            }
        }
        List<Double> rtts = new ArrayList<>();
        long ok = 0;
        long lost = 0;
        long errors = 0;
        for (Sample s : all) {
            switch (s.result) {
                case "OK" -> {
                    ok++;
                    rtts.add(s.rttMs);
                }
                case "LOST" -> lost++;
                default -> {
                    errors++;
                    rtts.add(s.rttMs);
                }
            }
        }
        Collections.sort(rtts);
        double avg = rtts.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        System.out.println();
        System.out.println("===== KET QUA GIA LAP TAI =====");
        System.out.printf(Locale.ROOT, "Thoi gian chay      : %.1f s%n", seconds);
        System.out.printf("Tin da gui          : %d%n", all.size());
        System.out.printf("Thanh cong (SALE_OK): %d%n", ok);
        System.out.printf("Bi tu choi (ERROR)  : %d%n", errors);
        System.out.printf("Mat tin (>5s)       : %d%n", lost);
        System.out.printf("Dang nhap that bai  : %d, mat ket noi: %d%n", loginFailures.get(), disconnects.get());
        System.out.printf(Locale.ROOT, "Thong luong         : %.1f tin/giay%n", all.size() / Math.max(seconds, 1));
        System.out.printf(Locale.ROOT, "Do tre TB / p50 / p95 / p99 / max (ms): %.2f / %.2f / %.2f / %.2f / %.2f%n",
                avg, pct(rtts, 50), pct(rtts, 95), pct(rtts, 99), rtts.isEmpty() ? 0 : rtts.get(rtts.size() - 1));
        boolean pass = lost == 0 && avg < 200 && loginFailures.get() == 0 && disconnects.get() == 0;
        System.out.println("NFR-02 (khong mat tin, do tre TB < 200 ms): " + (pass ? "DAT" : "KHONG DAT"));
        System.out.println("Chi tiet: " + out.toAbsolutePath());
    }

    private static double pct(List<Double> sorted, int p) {
        if (sorted.isEmpty()) {
            return 0;
        }
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }
}
