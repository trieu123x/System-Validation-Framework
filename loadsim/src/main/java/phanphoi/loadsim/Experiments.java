package phanphoi.loadsim;

import com.google.gson.JsonObject;
import phanphoi.common.Command;
import phanphoi.common.Config;
import phanphoi.common.LineReader;
import phanphoi.common.Message;
import phanphoi.common.ReconnectPolicy;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.lang.management.ManagementFactory;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Chạy các thực nghiệm so sánh baseline / đề xuất (docs/EXPERIMENTS.md). Mỗi thực nghiệm tự khởi động
 * server.jar với cấu hình tương ứng, giả lập chi nhánh ảo SIMxxx qua TCP thật, ghi CSV và bảng Markdown
 * vào experiments/results/.
 *
 * <pre>
 * java -cp loadsim/target/loadsim.jar phanphoi.loadsim.Experiments run=all
 * java -cp loadsim/target/loadsim.jar phanphoi.loadsim.Experiments run=e1,e3 e1.reps=10
 * </pre>
 * Cần: CSDL đã nạp db/seed_loadsim.sql (SIM001..SIM1000); cổng 5000 và 8080 đang trống.
 */
public final class Experiments {

    private static final String HOST = "127.0.0.1";
    /** Cổng TCP/HTTP của server thực nghiệm; đổi bằng tcp.port=, admin.port= khi 5000/8080 đang bận. */
    private static int PORT = 5000;
    private static final String PASSWORD = "123456";

    private final Config cfg;
    private final Path serverJar;
    private final Path outDir;
    private final int adminPort;
    private final AdminClient admin;
    private final StringBuilder summary = new StringBuilder();

    private Experiments(Config cfg) {
        this.cfg = cfg;
        this.serverJar = Path.of(cfg.get("server.jar", "server/target/server.jar"));
        this.outDir = Path.of(cfg.get("out", "experiments/results"));
        PORT = cfg.getInt("tcp.port", 5000);
        this.adminPort = cfg.getInt("admin.port", 8080);
        this.admin = new AdminClient("http://127.0.0.1:" + adminPort);
    }

    public static void main(String[] args) throws Exception {
        Config cfg = Config.load("config/experiments.properties", args);
        Experiments x = new Experiments(cfg);
        Files.createDirectories(x.outDir);
        String run = cfg.get("run", "all");
        List<String> which = "all".equals(run) ? List.of("e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8") : List.of(run.split(","));
        x.summary.append("# Kết quả thực nghiệm\n\n").append(x.environment()).append('\n');
        for (String e : which) {
            System.out.println("\n========== " + e.toUpperCase() + " ==========");
            switch (e.trim()) {
                case "e1" -> x.e1();
                case "e2" -> x.e2();
                case "e3" -> x.e3();
                case "e4" -> x.e4();
                case "e5" -> x.e5();
                case "e6" -> x.e6();
                case "e7" -> x.e7();
                case "e8" -> x.e8();
                default -> System.err.println("Khong co thuc nghiem " + e);
            }
        }
        String name = "all".equals(run) ? "RESULTS.md" : "RESULTS-" + run.replace(',', '-') + ".md";
        Files.writeString(x.outDir.resolve(name), x.summary.toString(), StandardCharsets.UTF_8);
        System.out.println("\nDa ghi " + x.outDir.resolve(name).toAbsolutePath());
        System.exit(0);
    }

    // =====================================================================================
    // E1 – Tranh chấp kho tổng khi nhiều chi nhánh cùng ACCEPT
    // =====================================================================================

    private void e1() throws Exception {
        int clients = cfg.getInt("e1.clients", 50);
        int reps = cfg.getInt("e1.reps", 5);
        int qty = 8;
        int stock = clients * qty / 2; // chỉ đủ cho một nửa số chi nhánh
        String sp = "TB05";
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        md.append("## E1 – Tranh chấp kho tổng (").append(clients).append(" chi nhánh cùng ACCEPT ").append(qty)
                .append(", kho tổng ").append(stock).append(", ").append(reps).append(" lần lặp)\n\n")
                .append("| Chiến lược | Số DELIVERED (kỳ vọng ").append(stock / qty).append(") | Tổng xuất | Bán vượt kho | Lần vi phạm bất biến | ACCEPT TB (ms) | ACCEPT p95 (ms) | Thời gian xong cả loạt (ms) |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|---:|\n");
        try (ServerProcess srv = startServer("e1", List.of("io.mode=nio"))) {
            for (String strategy : List.of("CHECK_THEN_ACT", "SYNCHRONIZED", "CONDITIONAL")) {
                admin.post("/api/experiment/settings", Map.of("acceptStrategy", strategy));
                List<Double> lat = new ArrayList<>();
                long delivered = 0;
                long shipped = 0;
                long oversold = 0;
                int violations = 0;
                List<Double> makespans = new ArrayList<>();
                for (int rep = 1; rep <= reps; rep++) {
                    admin.post("/api/experiment/prepare-offers",
                            Map.of("maSp", sp, "soChiNhanh", clients, "soLuong", qty, "khoTong", stock));
                    E1Run r = e1Once(clients, qty);
                    JsonObject res = admin.get("/api/experiment/accept-result?maSp=" + sp);
                    int khoCuoi = res.get("khoTong").getAsInt();
                    long tongXuat = res.get("tongXuat").getAsLong();
                    boolean ok = tongXuat + khoCuoi == stock && tongXuat <= stock;
                    delivered += r.delivered;
                    shipped += tongXuat;
                    oversold += Math.max(0, tongXuat - stock);
                    violations += ok ? 0 : 1;
                    lat.addAll(r.latencies);
                    makespans.add(r.makespanMs);
                    rows.add(String.join(",", strategy, "" + rep, "" + r.delivered, "" + r.outOfStock, "" + tongXuat,
                            "" + khoCuoi, "" + Math.max(0, tongXuat - stock), "" + ok, Stats.f(new Stats(r.latencies).avg),
                            Stats.f(new Stats(r.latencies).p95), Stats.f(r.makespanMs)));
                    System.out.printf("  %-15s lan %d: DELIVERED=%d tongXuat=%d khoCuoi=%d %s%n",
                            strategy, rep, r.delivered, tongXuat, khoCuoi, ok ? "OK" : "VI PHAM");
                }
                Stats s = new Stats(lat);
                md.append("| ").append(strategy).append(" | ").append(Stats.f1(delivered / (double) reps))
                        .append(" | ").append(Stats.f1(shipped / (double) reps))
                        .append(" | ").append(Stats.f1(oversold / (double) reps))
                        .append(" | ").append(violations).append("/").append(reps)
                        .append(" | ").append(Stats.f(s.avg)).append(" | ").append(Stats.f(s.p95))
                        .append(" | ").append(Stats.f(new Stats(makespans).avg)).append(" |\n");
            }
            admin.post("/api/experiment/settings", Map.of("acceptStrategy", "CONDITIONAL"));
            admin.post("/api/experiment/reset", Map.of());
        }
        md.append("\nCác cột là trung bình mỗi lần lặp. Bất biến: tổng xuất + tồn cuối = tồn đầu, và tổng xuất ≤ tồn đầu.\n\n");
        writeCsv("e1_accept_contention.csv",
                "chien_luoc,lan,delivered,out_of_stock,tong_xuat,kho_cuoi,ban_vuot,bat_bien_dung,accept_tb_ms,accept_p95_ms,makespan_ms",
                rows);
        summary.append(md);
    }

    private record E1Run(int delivered, int outOfStock, List<Double> latencies, double makespanMs) {
    }

    private E1Run e1Once(int n, int qty) throws Exception {
        List<SimClient> cs = new ArrayList<>();
        Map<SimClient, CompletableFuture<Integer>> offers = new ConcurrentHashMap<>();
        for (int i = 1; i <= n; i++) {
            SimClient c = new SimClient(sim(i), HOST, PORT, PASSWORD);
            CompletableFuture<Integer> f = new CompletableFuture<>();
            c.onPush(m -> {
                if (m.command() == Command.OFFER) {
                    f.complete(Integer.parseInt(m.param(0)));
                }
            });
            offers.put(c, f);
            cs.add(c);
        }
        loginAll(cs);
        CountDownLatch go = new CountDownLatch(1);
        List<Double> lat = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger delivered = new AtomicInteger();
        AtomicInteger oos = new AtomicInteger();
        AtomicLong lastReply = new AtomicLong();
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch done = new CountDownLatch(n);
        for (SimClient c : cs) {
            int maYc = offers.get(c).get(10, TimeUnit.SECONDS); // OFFER đến qua resync sau LOGIN_OK
            pool.execute(() -> {
                try {
                    go.await();
                    long t = System.nanoTime();
                    c.send(Message.of(Command.ACCEPT, maYc, qty));
                    Message r = c.await(15_000, Command.DELIVERED, Command.OUT_OF_STOCK, Command.ERROR);
                    lat.add((System.nanoTime() - t) / 1e6);
                    lastReply.accumulateAndGet(System.nanoTime(), Math::max);
                    if (r != null && r.command() == Command.DELIVERED) {
                        delivered.incrementAndGet();
                    } else if (r != null && r.command() == Command.OUT_OF_STOCK) {
                        oos.incrementAndGet();
                    }
                } catch (Exception e) {
                    System.err.println(c.id + ": " + e.getMessage());
                } finally {
                    done.countDown();
                }
            });
        }
        Thread.sleep(300); // mọi luồng đã chờ ở vạch xuất phát
        long start = System.nanoTime();
        go.countDown();
        done.await(30, TimeUnit.SECONDS);
        pool.shutdownNow();
        cs.forEach(SimClient::close);
        return new E1Run(delivered.get(), oos.get(), lat, (lastReply.get() - start) / 1e6);
    }

    // =====================================================================================
    // E2 – Độ tin cậy của tin push khi chi nhánh mất kết nối
    // =====================================================================================

    private void e2() throws Exception {
        int n = cfg.getInt("e2.clients", 30);
        int seconds = cfg.getInt("e2.seconds", 60);
        int rate = cfg.getInt("e2.offers.per.second", 10);
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        md.append("## E2 – Giao tin push khi mất kết nối (").append(n).append(" chi nhánh, ").append(seconds)
                .append(" giây, ~").append(rate).append(" OFFER/giây, mỗi chi nhánh online 3–8 s rồi mất mạng 2–5 s)\n\n")
                .append("| Chế độ giao tin | OFFER đã gửi | Chi nhánh nhận được | Mất | Tỉ lệ mất | Nhận trùng | Độ trễ nhận TB (ms) | Độ trễ nhận p95 (ms) |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|---:|\n");
        try (ServerProcess srv = startServer("e2", List.of("io.mode=nio"))) {
            for (String mode : List.of("NONE", "QUEUE", "QUEUE_RESYNC")) {
                admin.post("/api/experiment/settings", Map.of("delivery", mode));
                admin.post("/api/experiment/reset", Map.of());
                E2Run r = e2Once(n, seconds, rate);
                double lossPct = r.sent == 0 ? 0 : 100.0 * r.lost / r.sent;
                Stats s = new Stats(r.latencies);
                rows.add(String.join(",", mode, "" + r.sent, "" + r.received, "" + r.lost, Stats.f(lossPct),
                        "" + r.duplicates, "" + r.cleanOutages, "" + r.darkOutages, Stats.f(s.avg), Stats.f(s.p95)));
                md.append("| ").append(mode).append(" | ").append(r.sent).append(" | ").append(r.received)
                        .append(" | ").append(r.lost).append(" | ").append(Stats.f1(lossPct)).append("% | ")
                        .append(r.duplicates).append(" | ").append(Stats.f(s.avg)).append(" | ")
                        .append(Stats.f(s.p95)).append(" |\n");
                System.out.printf("  %-13s gui=%d nhan=%d mat=%d (%.1f%%) trung=%d%n", mode, r.sent, r.received,
                        r.lost, lossPct, r.duplicates);
            }
            admin.post("/api/experiment/settings", Map.of("delivery", "QUEUE_RESYNC"));
            admin.post("/api/experiment/reset", Map.of());
        }
        md.append("\nMất kết nối gồm hai loại xen kẽ: đóng socket (server biết ngay CN offline) và \"rút dây\"")
                .append(" (socket vẫn mở, mọi byte tới client bị mất, server không biết). Chi nhánh nhận OFFER thì REJECT")
                .append(" ngay để đóng YC. Sau khi hết giờ, mọi chi nhánh nối lại và chờ thêm 8 giây trước khi đếm.\n\n");
        writeCsv("e2_push_reliability.csv",
                "che_do,offer_gui,nhan,mat,ti_le_mat_pct,nhan_trung,so_lan_dong_socket,so_lan_rut_day,do_tre_tb_ms,do_tre_p95_ms",
                rows);
        summary.append(md);
    }

    private record E2Run(int sent, int received, int lost, int duplicates, int cleanOutages, int darkOutages,
                         List<Double> latencies) {
    }

    private E2Run e2Once(int n, int seconds, int rate) throws Exception {
        Map<Integer, Long> sentAt = new ConcurrentHashMap<>();
        Set<Integer> received = ConcurrentHashMap.newKeySet();
        Map<Integer, Long> receivedAt = new ConcurrentHashMap<>();
        Map<String, Integer> outstanding = new ConcurrentHashMap<>(); // "CN|SP" → maYc chưa nhận
        List<Double> lat = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger dup = new AtomicInteger();
        AtomicInteger clean = new AtomicInteger();
        AtomicInteger dark = new AtomicInteger();
        long end = System.currentTimeMillis() + seconds * 1000L;
        List<SimClient> cs = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            SimClient c = new SimClient(sim(i), HOST, PORT, PASSWORD);
            c.onPush(m -> {
                if (m.command() != Command.OFFER) {
                    return;
                }
                int maYc = Integer.parseInt(m.param(0));
                // OFFER có thể tới trước khi bộ chạy kịp ghi sentAt: lưu thời điểm nhận, ghép lại khi tổng kết
                if (!received.add(maYc)) {
                    dup.incrementAndGet();
                } else {
                    receivedAt.put(maYc, System.currentTimeMillis());
                }
                outstanding.remove(c.id + "|" + m.param(1), maYc);
                try {
                    c.send(Message.of(Command.REJECT, maYc));
                } catch (IOException ignored) {
                    // mất kết nối: YC còn mở, sẽ được gửi lại nếu có resync
                }
            });
            cs.add(c);
        }
        loginAll(cs);
        ExecutorService pool = Executors.newFixedThreadPool(n);
        for (SimClient c : cs) {
            pool.execute(() -> {
                ThreadLocalRandom rnd = ThreadLocalRandom.current();
                try {
                    while (System.currentTimeMillis() < end) {
                        Thread.sleep(rnd.nextLong(3000, 8000));
                        if (System.currentTimeMillis() >= end) {
                            break;
                        }
                        if (rnd.nextBoolean()) {
                            clean.incrementAndGet();
                            c.abort();
                            Thread.sleep(rnd.nextLong(2000, 5000));
                        } else {
                            dark.incrementAndGet();
                            c.dark = true; // "rút dây": byte tới nơi đều mất
                            Thread.sleep(rnd.nextLong(2000, 5000));
                            c.abort();
                        }
                        relogin(c);
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        String[] products = {"TB01", "TB02", "TB03", "TB04", "TB05"};
        Random rnd = new Random(42);
        long interval = 1000L / rate;
        while (System.currentTimeMillis() < end) {
            SimClient c = cs.get(rnd.nextInt(n));
            String sp = products[rnd.nextInt(products.length)];
            String key = c.id + "|" + sp;
            if (!outstanding.containsKey(key)) {
                JsonObject r = admin.post("/api/experiment/offer", Map.of("maCn", c.id, "maSp", sp, "soLuong", 5));
                int maYc = r.get("maYc").getAsInt();
                sentAt.put(maYc, System.currentTimeMillis());
                if (!received.contains(maYc)) {
                    outstanding.put(key, maYc);
                }
            }
            Thread.sleep(interval);
        }
        pool.shutdown();
        pool.awaitTermination(15, TimeUnit.SECONDS);
        for (SimClient c : cs) {
            if (!c.isOpen() || c.dark) {
                c.abort();
                relogin(c);
            }
        }
        Thread.sleep(8000);
        cs.forEach(SimClient::close);
        int sent = sentAt.size();
        int got = (int) sentAt.keySet().stream().filter(received::contains).count();
        sentAt.forEach((maYc, t) -> {
            Long r = receivedAt.get(maYc);
            if (r != null) {
                lat.add((double) Math.max(0, r - t));
            }
        });
        return new E2Run(sent, got, sent - got, dup.get(), clean.get(), dark.get(), lat);
    }

    private static void relogin(SimClient c) throws InterruptedException {
        for (int i = 0; i < 50; i++) {
            try {
                Message m = c.login(3000);
                if (m != null && m.command() == Command.LOGIN_OK) {
                    return;
                }
                c.abort();
            } catch (IOException e) {
                // server bận hoặc phiên cũ chưa được dọn
            }
            Thread.sleep(300);
        }
    }

    // =====================================================================================
    // E3 – Một chi nhánh treo (không đọc socket) khi server broadcast
    // =====================================================================================

    private void e3() throws Exception {
        int n = cfg.getInt("e3.clients", 20);
        int k = cfg.getInt("e3.broadcasts", 300);
        int payload = 3000;
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        md.append("## E3 – Client chậm khi broadcast (").append(n).append(" chi nhánh bình thường + 1 chi nhánh treo, ")
                .append(k).append(" broadcast × ").append(payload).append(" byte)\n\n")
                .append("| Server | Broadcast hoàn tất | Lần gọi lâu nhất (ms) | Tin tới CN bình thường | Độ trễ p50 (ms) | Độ trễ p95 (ms) | Độ trễ max (ms) | CN treo bị cắt |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|---|\n");
        record Variant(String name, List<String> args) {
        }
        List<Variant> variants = List.of(
                new Variant("BIO + ghi trực tiếp (baseline)", List.of("io.mode=bio", "write.mode=direct")),
                new Variant("BIO + hàng đợi gửi", List.of("io.mode=bio", "write.mode=queued", "send.queue.limit=256")),
                new Variant("NIO + hàng đợi gửi", List.of("io.mode=nio", "send.queue.limit=256")));
        int idx = 0;
        for (Variant v : variants) {
            idx++;
            try (ServerProcess srv = startServer("e3-" + idx, v.args)) {
                List<Double> lat = Collections.synchronizedList(new ArrayList<>());
                AtomicInteger got = new AtomicInteger();
                List<SimClient> cs = new ArrayList<>();
                for (int i = 1; i <= n; i++) {
                    SimClient c = new SimClient(sim(i), HOST, PORT, PASSWORD);
                    c.onPush(m -> {
                        if (m.command() == Command.BROADCAST) {
                            String[] parts = m.param(0).split(";", 3);
                            lat.add((double) (System.currentTimeMillis() - Long.parseLong(parts[1])));
                            got.incrementAndGet();
                        }
                    });
                    cs.add(c);
                }
                loginAll(cs);
                SimClient stuck = new SimClient(sim(n + 1), HOST, PORT, PASSWORD).receiveBuffer(4096);
                Message lm = stuck.login(5000);
                if (lm == null || lm.command() != Command.LOGIN_OK) {
                    throw new IllegalStateException("CN treo khong dang nhap duoc");
                }
                stuck.stall = true;
                String pad = "x".repeat(payload);
                int completed = 0;
                double longest = 0;
                long deadline = System.currentTimeMillis() + 30_000;
                for (int i = 0; i < k && System.currentTimeMillis() < deadline; i++) {
                    long t = System.nanoTime();
                    try {
                        admin.post("/api/experiment/broadcast",
                                Map.of("noiDung", i + ";" + System.currentTimeMillis() + ";" + pad), 5);
                        completed++;
                        longest = Math.max(longest, (System.nanoTime() - t) / 1e6);
                    } catch (IOException e) {
                        longest = Math.max(longest, (System.nanoTime() - t) / 1e6);
                        System.out.println("  broadcast " + i + " bi treo qua 5 s: dung gui");
                        break;
                    }
                }
                Thread.sleep(3000);
                boolean cut;
                try {
                    JsonObject rt = admin.get("/api/experiment/runtime");
                    cut = rt.get("online").getAsInt() == n;
                } catch (IOException e) {
                    cut = false;
                }
                Stats s = new Stats(lat);
                int expected = completed * n;
                rows.add(String.join(",", "\"" + v.name + "\"", "" + completed, Stats.f(longest), "" + got.get(),
                        "" + (k * n), Stats.f(s.p50), Stats.f(s.p95), Stats.f(s.max), "" + cut));
                md.append("| ").append(v.name).append(" | ").append(completed).append("/").append(k).append(" | ")
                        .append(Stats.f(longest)).append(" | ").append(got.get()).append("/").append(k * n)
                        .append(" | ").append(Stats.f(s.p50)).append(" | ").append(Stats.f(s.p95)).append(" | ")
                        .append(Stats.f(s.max)).append(" | ").append(cut ? "có" : "không").append(" |\n");
                System.out.printf("  %-30s broadcast xong %d/%d, CN binh thuong nhan %d (ky vong %d), cat CN treo: %s%n",
                        v.name, completed, k, got.get(), expected, cut);
                stuck.abort();
                cs.forEach(SimClient::abort);
            }
        }
        md.append("\nCN treo đặt bộ đệm nhận 4 KB và ngừng đọc socket sau khi đăng nhập. Mỗi lần gọi broadcast chờ tối đa 5 giây;")
                .append(" bị treo thì dừng gửi. Hàng đợi gửi giới hạn 256 tin/kết nối.\n\n");
        writeCsv("e3_slow_consumer.csv",
                "server,broadcast_hoan_tat,lan_goi_lau_nhat_ms,tin_toi_cn_binh_thuong,tin_ky_vong,do_tre_p50_ms,do_tre_p95_ms,do_tre_max_ms,cn_treo_bi_cat",
                rows);
        summary.append(md);
    }

    // =====================================================================================
    // E4 – Khả năng mở rộng: BIO thread-per-connection vs NIO selector
    // =====================================================================================

    private void e4() throws Exception {
        int seconds = cfg.getInt("e4.seconds", 30);
        List<Integer> sizes = new ArrayList<>();
        for (String s : cfg.get("e4.clients", "50,200,500").split(",")) {
            sizes.add(Integer.parseInt(s.trim()));
        }
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        md.append("## E4 – Khả năng mở rộng BIO và NIO (mỗi chi nhánh 1 SALE/giây trong ").append(seconds)
                .append(" giây)\n\n")
                .append("| Server | Số client | Tin gửi | Mất | Thông lượng (tin/s) | Độ trễ TB (ms) | p95 (ms) | p99 (ms) | Max (ms) | Luồng server (đỉnh) | Heap server (MB, đỉnh) |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");
        for (String io : List.of("bio", "nio")) {
            try (ServerProcess srv = startServer("e4-" + io, List.of("io.mode=" + io, "write.mode=queued"))) {
                for (int size : sizes) {
                    admin.post("/api/experiment/runtime/reset-peak", Map.of());
                    E4Run r = e4Once(size, seconds);
                    Stats s = new Stats(r.latencies);
                    rows.add(String.join(",", io, "" + size, "" + r.sent, "" + r.lost, Stats.f(r.throughput),
                            Stats.f(s.avg), Stats.f(s.p95), Stats.f(s.p99), Stats.f(s.max), "" + r.peakThreads,
                            Stats.f(r.peakHeapMb)));
                    md.append("| ").append(io.toUpperCase()).append(" | ").append(size).append(" | ").append(r.sent)
                            .append(" | ").append(r.lost).append(" | ").append(Stats.f1(r.throughput)).append(" | ")
                            .append(Stats.f(s.avg)).append(" | ").append(Stats.f(s.p95)).append(" | ")
                            .append(Stats.f(s.p99)).append(" | ").append(Stats.f(s.max)).append(" | ")
                            .append(r.peakThreads).append(" | ").append(Stats.f1(r.peakHeapMb)).append(" |\n");
                    System.out.printf("  %s %4d client: gui=%d mat=%d TB=%.2fms p95=%.2fms luong=%d%n",
                            io, size, r.sent, r.lost, s.avg, s.p95, r.peakThreads);
                }
            }
        }
        md.append("\nĐộ trễ đo từ lúc gửi SALE tới khi nhận SALE_OK (gồm một transaction CSDL). \"Mất\" = không có trả lời trong 5 giây.")
                .append(" Luồng server: số luồng JVM của server.jar (ThreadMXBean, đỉnh trong lần chạy).\n\n");
        writeCsv("e4_bio_vs_nio.csv",
                "server,so_client,tin_gui,mat,thong_luong,do_tre_tb_ms,p95_ms,p99_ms,max_ms,luong_dinh,heap_dinh_mb", rows);
        summary.append(md);
    }

    private record E4Run(int sent, int lost, double throughput, List<Double> latencies, int peakThreads,
                         double peakHeapMb) {
    }

    private E4Run e4Once(int n, int seconds) throws Exception {
        List<SimClient> cs = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            cs.add(new SimClient(sim(i), HOST, PORT, PASSWORD));
        }
        loginAll(cs);
        String[] products = {"TB01", "TB02", "TB03", "TB04", "TB05"};
        ConcurrentLinkedQueue<Double> lat = new ConcurrentLinkedQueue<>();
        AtomicInteger sent = new AtomicInteger();
        AtomicInteger lost = new AtomicInteger();
        long start = System.currentTimeMillis();
        long end = start + seconds * 1000L;
        int[] peakThreads = {0};
        double[] peakHeap = {0};
        Thread sampler = new Thread(() -> {
            while (System.currentTimeMillis() < end + 1000) {
                try {
                    JsonObject rt = admin.get("/api/experiment/runtime");
                    peakThreads[0] = Math.max(peakThreads[0], rt.get("peakThreads").getAsInt());
                    peakHeap[0] = Math.max(peakHeap[0], rt.get("heapUsedMb").getAsDouble());
                    Thread.sleep(1000);
                } catch (Exception e) {
                    return;
                }
            }
        });
        sampler.start();
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch done = new CountDownLatch(n);
        for (SimClient c : cs) {
            pool.execute(() -> {
                ThreadLocalRandom rnd = ThreadLocalRandom.current();
                long next = System.currentTimeMillis() + rnd.nextLong(1000);
                try {
                    while (true) {
                        long wait = next - System.currentTimeMillis();
                        if (wait > 0) {
                            Thread.sleep(wait);
                        }
                        if (System.currentTimeMillis() >= end) {
                            break;
                        }
                        next += 1000;
                        long t = System.nanoTime();
                        c.send(Message.of(Command.SALE, products[rnd.nextInt(products.length)], 1));
                        sent.incrementAndGet();
                        Message r = c.await(5000, Command.SALE_OK, Command.ERROR);
                        if (r == null) {
                            lost.incrementAndGet();
                        } else {
                            lat.add((System.nanoTime() - t) / 1e6);
                        }
                    }
                } catch (Exception e) {
                    lost.incrementAndGet();
                } finally {
                    done.countDown();
                }
            });
        }
        done.await(seconds + 30L, TimeUnit.SECONDS);
        double elapsed = (System.currentTimeMillis() - start) / 1000.0;
        pool.shutdownNow();
        sampler.join(3000);
        cs.forEach(SimClient::close);
        Thread.sleep(1000);
        return new E4Run(sent.get(), lost.get(), sent.get() / elapsed, new ArrayList<>(lat), peakThreads[0], peakHeap[0]);
    }

    // =====================================================================================
    // E5 – Nhiều chi nhánh nối lại cùng lúc khi server khởi động lại
    // =====================================================================================

    private void e5() throws Exception {
        int n = cfg.getInt("e5.clients", 300);
        int reps = cfg.getInt("e5.reps", 5);
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        md.append("## E5 – Kết nối lại hàng loạt (").append(n).append(" chi nhánh; server bị tắt đột ngột rồi bật lại sau 6–10 giây ngẫu nhiên; ")
                .append(reps).append(" lần mỗi chính sách)\n\n")
                .append("| Chính sách | Đã nối lại | Thời gian nối lại TB (ms) | p95 (ms) | Max (ms) | Lần thử / client | Đỉnh lần thử / 100 ms |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|\n");
        Random rnd = new Random(2026);
        for (String policyName : List.of("fixed", "backoff", "jitter")) {
            ReconnectPolicy policy = ReconnectPolicy.parse(policyName, 500, 5000);
            ServerProcess srv = startServer("e5-" + policyName + "-0", List.of("io.mode=nio"));
            List<SimClient> cs = new ArrayList<>();
            for (int i = 1; i <= n; i++) {
                cs.add(new SimClient(sim(i), HOST, PORT, PASSWORD));
            }
            loginAll(cs);
            List<Double> allTimes = new ArrayList<>();
            long attempts = 0;
            double peakSum = 0;
            int reconnected = 0;
            for (int rep = 1; rep <= reps; rep++) {
                ConcurrentLinkedQueue<Long> attemptTimes = new ConcurrentLinkedQueue<>();
                Map<String, Long> reconnectedAt = new ConcurrentHashMap<>();
                ExecutorService pool = Executors.newFixedThreadPool(n);
                for (SimClient c : cs) {
                    pool.execute(() -> {
                        try {
                            while (c.isOpen()) {
                                Thread.sleep(20);
                            }
                            for (int attempt = 0; attempt < 100; attempt++) {
                                Thread.sleep(policy.delayMs(attempt));
                                attemptTimes.add(System.currentTimeMillis());
                                try {
                                    Message m = c.login(3000);
                                    if (m != null && m.command() == Command.LOGIN_OK) {
                                        reconnectedAt.put(c.id, System.currentTimeMillis());
                                        return;
                                    }
                                    c.abort();
                                } catch (IOException e) {
                                    // server chưa lên
                                }
                            }
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    });
                }
                Thread.sleep(500);
                srv.kill();
                long down = 6000 + rnd.nextInt(4001);
                Thread.sleep(down);
                srv = startServer("e5-" + policyName + "-" + rep, List.of("io.mode=nio"));
                long ready = srv.tcpReadyAt();
                long waitUntil = System.currentTimeMillis() + 40_000;
                while (reconnectedAt.size() < n && System.currentTimeMillis() < waitUntil) {
                    Thread.sleep(200);
                }
                pool.shutdownNow();
                pool.awaitTermination(5, TimeUnit.SECONDS);
                List<Double> times = new ArrayList<>();
                for (long t : reconnectedAt.values()) {
                    times.add((double) Math.max(0, t - ready));
                }
                Map<Long, Integer> buckets = new ConcurrentHashMap<>();
                for (long t : attemptTimes) {
                    buckets.merge(t / 100, 1, Integer::sum);
                }
                int peak = buckets.values().stream().mapToInt(Integer::intValue).max().orElse(0);
                Stats s = new Stats(times);
                allTimes.addAll(times);
                attempts += attemptTimes.size();
                peakSum += peak;
                reconnected += reconnectedAt.size();
                rows.add(String.join(",", policyName, "" + rep, "" + down, "" + reconnectedAt.size(), Stats.f(s.avg),
                        Stats.f(s.p95), Stats.f(s.max), "" + attemptTimes.size(), "" + peak));
                System.out.printf("  %-8s lan %d (tat %d ms): noi lai %d/%d, TB %.0f ms, p95 %.0f ms, %d lan thu, dinh %d/100ms%n",
                        policyName, rep, down, reconnectedAt.size(), n, s.avg, s.p95, attemptTimes.size(), peak);
            }
            Stats s = new Stats(allTimes);
            String label = switch (policyName) {
                case "fixed" -> "Cố định 5 s (baseline SRS)";
                case "backoff" -> "Exponential backoff + full jitter";
                default -> "Jitter lệch pha (đề xuất)";
            };
            md.append("| ").append(label).append(" | ").append(reconnected).append("/").append(n * reps)
                    .append(" | ").append(Stats.f(s.avg)).append(" | ").append(Stats.f(s.p95)).append(" | ")
                    .append(Stats.f(s.max)).append(" | ").append(Stats.f(attempts / (double) (n * reps)))
                    .append(" | ").append(Stats.f1(peakSum / reps)).append(" |\n");
            cs.forEach(SimClient::close);
            Thread.sleep(1000);
            srv.close();
        }
        md.append("\nThời gian nối lại tính từ lúc cổng TCP của server mới bắt đầu lắng nghe tới khi chi nhánh nhận LOGIN_OK.")
                .append(" Cả ba chính sách chờ tối đa 5 giây giữa hai lần thử (FR-05). Đỉnh lần thử là số lần kết nối")
                .append(" rơi vào cùng một khung 100 ms, trung bình qua các lần lặp.\n\n");
        writeCsv("e5_reconnect_storm.csv",
                "chinh_sach,lan,server_tat_ms,da_noi_lai,tb_ms,p95_ms,max_ms,so_lan_thu,dinh_moi_100ms", rows);
        summary.append(md);
    }


    // =====================================================================================
    // E6 – Luồng cấp hàng trọn vẹn khi 50–100 chi nhánh cùng báo thiếu (live test hai phía)
    // =====================================================================================

    /** Số liệu một lần chạy E6; bot admin (luồng SSE) và các chi nhánh ảo cùng ghi vào. */
    private static final class E6State {
        final String sp;
        final int ship;
        final Map<String, Long> lowAt = new ConcurrentHashMap<>();
        final Map<Integer, Long> shipAt = new ConcurrentHashMap<>();
        final Map<Integer, Long> finalAt = new ConcurrentHashMap<>();
        final Set<Integer> pushed = ConcurrentHashMap.newKeySet();
        final ConcurrentLinkedQueue<Double> saleRtt = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Double> alertLat = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Double> shipHttp = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Double> pushLat = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Double> finalLat = new ConcurrentLinkedQueue<>();
        final ConcurrentLinkedQueue<Double> cycle = new ConcurrentLinkedQueue<>();
        final AtomicInteger alerts = new AtomicInteger();
        final AtomicInteger shipped = new AtomicInteger();
        final AtomicInteger shortages = new AtomicInteger();
        final AtomicInteger delivered = new AtomicInteger();
        final AtomicInteger outOfStock = new AtomicInteger();
        final AtomicInteger lost = new AtomicInteger();
        final AtomicInteger lostFinal = new AtomicInteger();
        final AtomicInteger duplicates = new AtomicInteger();
        final AtomicInteger errors = new AtomicInteger();
        final AtomicInteger adminErrors = new AtomicInteger();

        E6State(String sp, int ship) {
            this.sp = sp;
            this.ship = ship;
        }
    }

    private record E6Run(E6State st, int clients, int rounds, int stock, double seconds, int disconnects,
                         int peakThreads, double peakHeapMb, JsonObject db) {
    }

    private void e6() throws Exception {
        List<Integer> sizes = new ArrayList<>();
        for (String s : cfg.get("e6.clients", "50,100").split(",")) {
            sizes.add(Integer.parseInt(s.trim()));
        }
        int rounds = cfg.getInt("e6.rounds", 5);
        boolean external = cfg.getBool("e6.external", false);
        StringBuilder ok = new StringBuilder();
        StringBuilder lat = new StringBuilder();
        List<String> rows = new ArrayList<>();
        ok.append("## E6 – Luồng cấp hàng trọn vẹn: ").append(sizes).append(" chi nhánh cùng báo thiếu, ")
                .append(rounds).append(" vòng mỗi chi nhánh\n\n")
                .append("Mỗi vòng: chi nhánh bán xuống dưới ngưỡng → tự gửi LOW_STOCK → bot admin nhận cảnh báo qua SSE ")
                .append("→ bấm \"Gửi hàng\" (kho tổng hết thì \"Báo hết hàng\") → chi nhánh nhận DELIVERED và gửi RECEIVED ")
                .append("(hoặc nhận OUT_OF_STOCK và gửi REJECT) → admin thấy trạng thái \"Đã nhận\"/\"Từ chối\" qua SSE. ")
                .append("Kho tổng chỉ đủ 80% số lần gửi để luôn có nhánh báo hết hàng. Vòng đầu mọi chi nhánh bán cùng lúc.\n\n")
                .append("| Số CN | Cảnh báo (kỳ vọng) | Gửi hàng | Báo hết hàng | CN nhận DELIVERED | CN nhận OUT_OF_STOCK | Mất tin | Trùng | Lỗi | Mất kết nối | Kho tổng đúng (không bán vượt) | YC còn treo | Thời gian (s) |\n")
                .append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|\n");
        lat.append("\nĐộ trễ (ms, TB / p95 / max):\n\n")
                .append("| Số CN | SALE → SALE_OK | LOW_STOCK → admin thấy cảnh báo | HTTP gửi hàng | Admin bấm → CN nhận tin | CN bấm nhận → admin thấy \"Đã nhận\" | Trọn vòng | Luồng server (đỉnh) | Heap (MB, đỉnh) |\n")
                .append("|---:|---|---|---|---|---|---|---:|---:|\n");

        ServerProcess srv = external ? null : startServer("e6", serverArgs("e6.server"));
        AtomicReference<E6State> current = new AtomicReference<>();
        ExecutorService adminPool = Executors.newFixedThreadPool(cfg.getInt("e6.admin.threads", 8));
        Thread sse = null;
        try {
            admin.login(cfg.get("e6.admin.user", "admin"), cfg.get("e6.admin.password", "admin123"));
            CountDownLatch sseReady = new CountDownLatch(1);
            sse = new Thread(() -> {
                try {
                    admin.events((ev, d) -> {
                        try {
                            onAdminEvent(ev, d, current.get(), adminPool, sseReady);
                        } catch (RuntimeException e) {
                            // sự kiện lạ không được làm chết luồng SSE của bot admin
                            System.err.println("  [e6] bo qua su kien " + ev + ": " + e);
                        }
                    });
                } catch (Exception e) {
                    // server tắt hoặc kết thúc thực nghiệm
                }
            }, "e6-sse");
            sse.setDaemon(true);
            sse.start();
            if (!sseReady.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Khong mo duoc SSE /api/events");
            }
            for (int size : sizes) {
                E6Run r = e6Once(size, rounds, current);
                E6State st = r.st;
                int expected = size * rounds;
                boolean noOversell = r.db.get("tongXuat").getAsInt() + r.db.get("khoTong").getAsInt() == r.stock
                        && r.db.get("khoTong").getAsInt() >= 0;
                int open = r.db.get("soConMo").getAsInt();
                ok.append("| ").append(size).append(" | ").append(st.alerts.get()).append(" (").append(expected).append(") | ")
                        .append(st.shipped.get()).append(" | ").append(st.shortages.get()).append(" | ")
                        .append(st.delivered.get()).append(" | ").append(st.outOfStock.get()).append(" | ")
                        .append(st.lost.get() + st.lostFinal.get()).append(" | ").append(st.duplicates.get()).append(" | ")
                        .append(st.errors.get() + st.adminErrors.get()).append(" | ").append(r.disconnects).append(" | ")
                        .append(noOversell ? "Đúng" : "SAI").append(" (xuất ").append(r.db.get("tongXuat").getAsInt())
                        .append(" + còn ").append(r.db.get("khoTong").getAsInt()).append(" = ").append(r.stock).append(") | ")
                        .append(open).append(" | ").append(Stats.f1(r.seconds)).append(" |\n");
                lat.append("| ").append(size).append(" | ").append(cell(st.saleRtt)).append(" | ").append(cell(st.alertLat))
                        .append(" | ").append(cell(st.shipHttp)).append(" | ").append(cell(st.pushLat)).append(" | ")
                        .append(cell(st.finalLat)).append(" | ").append(cell(st.cycle)).append(" | ")
                        .append(r.peakThreads).append(" | ").append(Stats.f1(r.peakHeapMb)).append(" |\n");
                rows.add(String.join(",", "" + size, "" + rounds, "" + st.alerts.get(), "" + expected, "" + st.shipped.get(),
                        "" + st.shortages.get(), "" + st.delivered.get(), "" + st.outOfStock.get(),
                        "" + (st.lost.get() + st.lostFinal.get()), "" + st.duplicates.get(),
                        "" + (st.errors.get() + st.adminErrors.get()), "" + r.disconnects, "" + noOversell, "" + open,
                        csv(st.saleRtt), csv(st.alertLat), csv(st.shipHttp), csv(st.pushLat), csv(st.finalLat), csv(st.cycle),
                        "" + r.peakThreads, Stats.f(r.peakHeapMb), Stats.f(r.seconds)));
                System.out.printf("  %3d CN: canh bao=%d/%d gui=%d het hang=%d mat=%d trung=%d loi=%d mat ket noi=%d kho %s, vong p95=%.1fms%n",
                        size, st.alerts.get(), expected, st.shipped.get(), st.shortages.get(),
                        st.lost.get() + st.lostFinal.get(), st.duplicates.get(), st.errors.get() + st.adminErrors.get(),
                        r.disconnects, noOversell ? "dung" : "SAI", new Stats(st.cycle).p95);
            }
        } finally {
            adminPool.shutdownNow();
            if (sse != null) {
                sse.interrupt();
            }
            if (srv != null) {
                srv.close();
            }
        }
        writeCsv("e6_live_flow.csv", "so_cn,so_vong,canh_bao,ky_vong,gui_hang,bao_het_hang,nhan_delivered,nhan_out_of_stock,"
                + "mat_tin,trung,loi,mat_ket_noi,kho_dung,yc_con_mo,sale_tb,sale_p95,sale_max,alert_tb,alert_p95,alert_max,"
                + "ship_http_tb,ship_http_p95,ship_http_max,push_tb,push_p95,push_max,final_tb,final_p95,final_max,"
                + "vong_tb,vong_p95,vong_max,luong_dinh,heap_dinh_mb,thoi_gian_s", rows);
        summary.append(ok).append(lat)
                .append("\n\"Mất tin\": chi nhánh không nhận được DELIVERED/OUT_OF_STOCK trong 30 s, hoặc admin không thấy trạng thái cuối trong 10 s. ")
                .append("\"Trọn vòng\": từ lúc chi nhánh gửi LOW_STOCK tới lúc admin thấy \"Đã nhận\"/\"Từ chối\", gồm cả thời gian bot admin phản ứng. ")
                .append("Mọi thời điểm đo bằng cùng một đồng hồ (System.nanoTime trong tiến trình giả lập).\n\n");
    }

    /** Bot admin: phản ứng sự kiện SSE giống người bấm trên trang Tổng quan, nhưng tức thì. */
    private void onAdminEvent(String ev, JsonObject d, E6State st, ExecutorService pool, CountDownLatch ready) {
        long now = System.nanoTime();
        if ("branches".equals(ev)) {
            ready.countDown();
            return;
        }
        // chỉ alert/request mang maYc, maSp; stock, message... bỏ qua
        if (st == null || !("alert".equals(ev) || "request".equals(ev)) || !d.has("maSp")
                || !d.get("maCn").getAsString().startsWith("SIM") || !st.sp.equals(d.get("maSp").getAsString())) {
            return;
        }
        int yc = d.get("maYc").getAsInt();
        if ("alert".equals(ev)) {
            st.alerts.incrementAndGet();
            Long t = st.lowAt.get(d.get("maCn").getAsString());
            if (t != null) {
                st.alertLat.add((now - t) / 1e6);
            }
            pool.execute(() -> {
                long t0 = System.nanoTime();
                st.shipAt.put(yc, t0);
                try {
                    admin.post("/api/requests/" + yc + "/ship", Map.of("soLuong", st.ship));
                    st.shipHttp.add((System.nanoTime() - t0) / 1e6);
                    st.shipped.incrementAndGet();
                } catch (AdminClient.HttpError e) {
                    if (e.status != 400) {
                        st.adminErrors.incrementAndGet();
                        return;
                    }
                    try {
                        // kho tổng không đủ: báo hết hàng cho chi nhánh
                        admin.post("/api/requests/" + yc + "/shortage", Map.of("soLuong", st.ship));
                        st.shortages.incrementAndGet();
                    } catch (Exception e2) {
                        st.adminErrors.incrementAndGet();
                    }
                } catch (Exception e) {
                    st.adminErrors.incrementAndGet();
                }
            });
        } else if ("request".equals(ev)) {
            String state = d.get("trangThai").getAsString();
            if ("HOAN_TAT".equals(state) || "TU_CHOI".equals(state)) {
                st.finalAt.putIfAbsent(yc, now);
            }
        }
    }

    private E6Run e6Once(int n, int rounds, AtomicReference<E6State> current) throws Exception {
        String sp = cfg.get("e6.product", "TB05");
        int nguong = 10;
        int ship = 10;
        int stock = n * rounds * ship * 4 / 5; // đủ cho 80% số lần gửi
        int before = admin.post("/api/experiment/prepare-live", Map.of("maSp", sp, "soChiNhanh", n, "tonCn", 12,
                "nguong", nguong, "khoTong", stock)).get("khoTongTruoc").getAsInt();
        E6State st = new E6State(sp, ship);
        current.set(st);
        try {
            List<SimClient> cs = new ArrayList<>();
            Map<String, LinkedBlockingQueue<Message>> pushes = new ConcurrentHashMap<>();
            for (int i = 1; i <= n; i++) {
                LinkedBlockingQueue<Message> q = new LinkedBlockingQueue<>();
                SimClient c = new SimClient(sim(i), HOST, PORT, PASSWORD).onPush(m -> {
                    if (m.command() == Command.DELIVERED || m.command() == Command.OUT_OF_STOCK) {
                        q.add(m);
                    }
                });
                pushes.put(c.id, q);
                cs.add(c);
            }
            loginAll(cs);
            admin.post("/api/experiment/runtime/reset-peak", Map.of());
            int[] peakThreads = {0};
            double[] peakHeap = {0};
            AtomicReference<Boolean> running = new AtomicReference<>(true);
            Thread sampler = new Thread(() -> {
                while (running.get()) {
                    try {
                        JsonObject rt = admin.get("/api/experiment/runtime");
                        peakThreads[0] = Math.max(peakThreads[0], rt.get("peakThreads").getAsInt());
                        peakHeap[0] = Math.max(peakHeap[0], rt.get("heapUsedMb").getAsDouble());
                        Thread.sleep(500);
                    } catch (Exception e) {
                        return;
                    }
                }
            });
            sampler.start();

            CountDownLatch go = new CountDownLatch(1);
            CountDownLatch done = new CountDownLatch(n);
            ExecutorService pool = Executors.newFixedThreadPool(n);
            for (SimClient c : cs) {
                pool.execute(() -> {
                    try {
                        e6Client(c, pushes.get(c.id), st, rounds, nguong, go);
                    } catch (Exception e) {
                        st.errors.incrementAndGet();
                    } finally {
                        done.countDown();
                    }
                });
            }
            long t0 = System.nanoTime();
            go.countDown();
            done.await(rounds * 60L + 60, TimeUnit.SECONDS);
            double seconds = (System.nanoTime() - t0) / 1e9;
            running.set(false);
            sampler.join(3000);
            pool.shutdownNow();
            int disconnects = (int) cs.stream().filter(c -> !c.isOpen()).count();
            Thread.sleep(500);
            JsonObject db = admin.get("/api/experiment/live-result?maSp=" + sp);
            cs.forEach(SimClient::close);
            Thread.sleep(500);
            return new E6Run(st, n, rounds, stock, seconds, disconnects, peakThreads[0], peakHeap[0], db);
        } finally {
            current.set(null);
            admin.post("/api/experiment/finish-live", Map.of("maSp", sp, "khoTong", before));
        }
    }

    /** Một chi nhánh ảo làm đủ các vòng bán → báo thiếu → nhận hàng (hoặc từ chối khi hết hàng). */
    private static void e6Client(SimClient c, LinkedBlockingQueue<Message> push, E6State st, int rounds, int nguong,
                                 CountDownLatch go) throws Exception {
        int stock = 12;
        go.await();
        for (int round = 0; round < rounds; round++) {
            int sell = stock - (nguong - 1);
            if (sell > 0) {
                long t = System.nanoTime();
                c.send(Message.of(Command.SALE, st.sp, sell));
                Message m = c.await(10_000, Command.SALE_OK, Command.ERROR);
                if (m == null) {
                    st.lost.incrementAndGet();
                    return;
                }
                if (m.command() == Command.ERROR) {
                    st.errors.incrementAndGet();
                    return;
                }
                st.saleRtt.add((System.nanoTime() - t) / 1e6);
                stock = m.intParam(1);
            }
            long tLow = System.nanoTime();
            st.lowAt.put(c.id, tLow);
            c.send(Message.of(Command.LOW_STOCK, st.sp, stock, nguong));
            Message p = push.poll(30, TimeUnit.SECONDS);
            if (p == null) {
                st.lost.incrementAndGet();
                return;
            }
            int yc = p.intParam(0);
            if (!st.pushed.add(yc)) {
                st.duplicates.incrementAndGet();
            }
            long tPush = System.nanoTime();
            Long ts = st.shipAt.get(yc);
            if (ts != null) {
                st.pushLat.add((tPush - ts) / 1e6);
            }
            long tAnswer = System.nanoTime();
            if (p.command() == Command.DELIVERED) {
                st.delivered.incrementAndGet();
                c.send(Message.of(Command.RECEIVED, yc));
                stock += p.intParam(2);
            } else {
                st.outOfStock.incrementAndGet();
                c.send(Message.of(Command.REJECT, yc));
            }
            // chờ admin thấy trạng thái cuối rồi mới sang vòng sau (LOW_STOCK vòng sau phải tạo YC mới)
            long deadline = System.currentTimeMillis() + 10_000;
            Long fin;
            while ((fin = st.finalAt.get(yc)) == null && System.currentTimeMillis() < deadline) {
                Thread.sleep(2);
            }
            if (fin == null) {
                st.lostFinal.incrementAndGet();
                return;
            }
            st.finalLat.add((fin - tAnswer) / 1e6);
            st.cycle.add((fin - tLow) / 1e6);
        }
    }

    /** "io.mode=nio" cộng các tham số server thêm, viết dạng e6.server=db.pool.size=40;nio.workers=32. */
    private List<String> serverArgs(String key) {
        List<String> args = new ArrayList<>(List.of("io.mode=nio"));
        for (String a : cfg.get(key, "").split(";")) {
            if (!a.isBlank()) {
                args.add(a.trim());
            }
        }
        return args;
    }

    // =====================================================================================
    // E7 – Tầng mạng thuần: PING/PONG không chạm CSDL, n client cùng gửi liên tục
    // =====================================================================================

    private void e7() throws Exception {
        List<Integer> sizes = new ArrayList<>();
        for (String s : cfg.get("e7.clients", "100,500").split(",")) {
            sizes.add(Integer.parseInt(s.trim()));
        }
        int seconds = cfg.getInt("e7.seconds", 20);
        int rate = cfg.getInt("e7.rate", 10);
        StringBuilder md = new StringBuilder();
        List<String> rows = new ArrayList<>();
        md.append("## E7 – Tầng mạng thuần: mỗi chi nhánh gửi ").append(rate).append(" PING/giây trong ").append(seconds)
                .append(" giây\n\n")
                .append("Server trả PONG ngay trên luồng worker NIO, không chạm CSDL, nên số đo phản ánh riêng tầng TCP/NIO ")
                .append("(đọc dòng, tách tin, hàng đợi gửi, Selector).\n\n")
                .append("| Số CN | Tin gửi | Mất | Thông lượng (tin/s) | RTT TB (ms) | p95 | p99 | Max | Mất kết nối | Luồng server (đỉnh) | Heap (MB, đỉnh) |\n")
                .append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");
        try (ServerProcess srv = startServer("e7", serverArgs("e7.server"))) {
            for (int n : sizes) {
                List<SimClient> cs = new ArrayList<>();
                for (int i = 1; i <= n; i++) {
                    cs.add(new SimClient(sim(i), HOST, PORT, PASSWORD));
                }
                loginAll(cs);
                admin.post("/api/experiment/runtime/reset-peak", Map.of());
                ConcurrentLinkedQueue<Double> rtt = new ConcurrentLinkedQueue<>();
                AtomicInteger sent = new AtomicInteger();
                AtomicInteger lost = new AtomicInteger();
                long end = System.currentTimeMillis() + seconds * 1000L;
                int[] peakThreads = {0};
                double[] peakHeap = {0};
                Thread sampler = new Thread(() -> {
                    while (System.currentTimeMillis() < end + 500) {
                        try {
                            JsonObject rt = admin.get("/api/experiment/runtime");
                            peakThreads[0] = Math.max(peakThreads[0], rt.get("peakThreads").getAsInt());
                            peakHeap[0] = Math.max(peakHeap[0], rt.get("heapUsedMb").getAsDouble());
                            Thread.sleep(500);
                        } catch (Exception e) {
                            return;
                        }
                    }
                });
                sampler.start();
                ExecutorService pool = Executors.newFixedThreadPool(n);
                CountDownLatch done = new CountDownLatch(n);
                long t0 = System.nanoTime();
                long gap = 1000L / rate;
                for (SimClient c : cs) {
                    pool.execute(() -> {
                        long next = System.currentTimeMillis() + ThreadLocalRandom.current().nextLong(gap);
                        try {
                            while (true) {
                                long wait = next - System.currentTimeMillis();
                                if (wait > 0) {
                                    Thread.sleep(wait);
                                }
                                if (System.currentTimeMillis() >= end) {
                                    break;
                                }
                                next += gap;
                                long t = System.nanoTime();
                                c.send(Message.of(Command.PING));
                                sent.incrementAndGet();
                                if (c.await(5000, Command.PONG) == null) {
                                    lost.incrementAndGet();
                                } else {
                                    rtt.add((System.nanoTime() - t) / 1e6);
                                }
                            }
                        } catch (Exception e) {
                            lost.incrementAndGet();
                        } finally {
                            done.countDown();
                        }
                    });
                }
                done.await(seconds + 30L, TimeUnit.SECONDS);
                double elapsed = (System.nanoTime() - t0) / 1e9;
                pool.shutdownNow();
                sampler.join(3000);
                int disconnects = (int) cs.stream().filter(c -> !c.isOpen()).count();
                cs.forEach(SimClient::close);
                Thread.sleep(1000);
                Stats st = new Stats(rtt);
                double tput = sent.get() / elapsed;
                md.append("| ").append(n).append(" | ").append(sent.get()).append(" | ").append(lost.get()).append(" | ")
                        .append(Stats.f1(tput)).append(" | ").append(Stats.f(st.avg)).append(" | ").append(Stats.f(st.p95))
                        .append(" | ").append(Stats.f(st.p99)).append(" | ").append(Stats.f(st.max)).append(" | ")
                        .append(disconnects).append(" | ").append(peakThreads[0]).append(" | ").append(Stats.f1(peakHeap[0]))
                        .append(" |\n");
                rows.add(String.join(",", "" + n, "" + sent.get(), "" + lost.get(), Stats.f(tput), Stats.f(st.avg),
                        Stats.f(st.p95), Stats.f(st.p99), Stats.f(st.max), "" + disconnects, "" + peakThreads[0],
                        Stats.f(peakHeap[0])));
                System.out.printf("  %3d CN: gui=%d mat=%d %.0f tin/s RTT TB=%.2fms p95=%.2fms p99=%.2fms max=%.1fms mat ket noi=%d luong=%d%n",
                        n, sent.get(), lost.get(), tput, st.avg, st.p95, st.p99, st.max, disconnects, peakThreads[0]);
            }
        }
        md.append("\n\"Mất\" = không có PONG trong 5 giây. Client ảo, server và CSDL cùng một máy (loopback).\n\n");
        writeCsv("e7_network_ping.csv", "so_cn,tin_gui,mat,thong_luong,rtt_tb_ms,p95_ms,p99_ms,max_ms,mat_ket_noi,luong_dinh,heap_dinh_mb", rows);
        summary.append(md);
    }

    // =====================================================================================
    // E8 – Bị tấn công: so sánh security.mode = off | detect | block
    // =====================================================================================

    /** Kết quả của một kẻ tấn công trong một lượt. */
    private static final class Attack {
        final String name;
        final String host;
        final String behaviour;
        final AtomicInteger handled = new AtomicInteger();
        volatile long startedAt;
        volatile long blockedAt;
        volatile String blockedBy = "";

        Attack(String name, String host, String behaviour) {
            this.name = name;
            this.host = host;
            this.behaviour = behaviour;
        }

        void blocked(String why) {
            if (blockedAt == 0) {
                blockedAt = System.currentTimeMillis();
                blockedBy = why;
            }
        }
    }

    /** Socket thô cho kẻ tấn công: luồng đọc riêng gọi onLine với mỗi dòng nhận được. */
    private static final class RawConn implements AutoCloseable {
        private final Socket socket;
        private final OutputStream out;
        volatile boolean closed;

        RawConn(String host, int port, java.util.function.Consumer<String> onLine) throws IOException {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 3000);
            socket.setTcpNoDelay(true);
            out = new BufferedOutputStream(socket.getOutputStream());
            Thread t = new Thread(() -> {
                try {
                    LineReader r = new LineReader(socket.getInputStream());
                    String line;
                    while ((line = r.readLine()) != null) {
                        if (line != LineReader.TOO_LONG) {
                            onLine.accept(line);
                        }
                    }
                } catch (IOException ignored) {
                    // server đóng hoặc mình đóng
                } finally {
                    closed = true;
                }
            }, "e8-attacker");
            t.setDaemon(true);
            t.start();
        }

        boolean send(String line) {
            if (closed) {
                return false;
            }
            try {
                out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
                return true;
            } catch (IOException e) {
                closed = true;
                return false;
            }
        }

        @Override
        public void close() {
            try {
                socket.close();
            } catch (IOException ignored) {
                // đã đóng
            }
        }
    }

    /**
     * Địa chỉ nguồn cho kẻ tấn công: mỗi kẻ một IP để quy tắc theo IP không chạm vào chi nhánh thật ở 127.0.0.1.
     * Windows không cho bind 127.0.0.x khác làm IP nguồn, nên mặc định lấy các địa chỉ của chính máy này
     * (nối tới địa chỉ nào thì server thấy IP nguồn là địa chỉ đó): IPv4 không phải loopback, IPv6 toàn cục, ::1.
     * Ghi đè bằng e8.attacker.hosts=a,b,c,d.
     */
    private List<String> attackerHosts(int need) throws IOException {
        String conf = cfg.get("e8.attacker.hosts", "");
        List<String> out = new ArrayList<>();
        if (!conf.isBlank()) {
            for (String h : conf.split(",")) {
                if (!h.isBlank()) {
                    out.add(h.trim());
                }
            }
        } else {
            List<String> v6 = new ArrayList<>();
            for (java.net.NetworkInterface nic : Collections.list(java.net.NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp() || nic.isLoopback()) {
                    continue;
                }
                for (java.net.InetAddress a : Collections.list(nic.getInetAddresses())) {
                    if (a.isLoopbackAddress() || a.isLinkLocalAddress()) {
                        continue;
                    }
                    String h = a.getHostAddress().replaceAll("%.*$", "");
                    if (a instanceof java.net.Inet4Address) {
                        out.add(h);
                    } else {
                        v6.add(h);
                    }
                }
            }
            out.addAll(v6);
            out.add("::1");
        }
        List<String> distinct = new ArrayList<>(new java.util.LinkedHashSet<>(out));
        if (distinct.isEmpty()) {
            throw new IllegalStateException("Khong tim duoc dia chi cho ke tan cong, dat e8.attacker.hosts=");
        }
        List<String> picked = new ArrayList<>();
        for (int i = 0; i < need; i++) {
            picked.add(distinct.get(i % distinct.size()));
        }
        if (distinct.size() < need) {
            System.out.println("  canh bao: chi co " + distinct.size() + " dia chi, ke tan cong dung chung IP: " + picked);
        }
        return picked;
    }

    private void e8() throws Exception {
        int n = cfg.getInt("e8.clients", 20);
        int warmupSec = cfg.getInt("e8.warmup.seconds", 5);
        int calmSec = cfg.getInt("e8.calm.seconds", 10);
        int attackSec = cfg.getInt("e8.attack.seconds", 30);
        int floodRate = cfg.getInt("e8.flood.rate", 500);
        int scrapeRate = cfg.getInt("e8.scrape.rate", 200);
        int junkRate = cfg.getInt("e8.junk.rate", 50);
        int bruteRate = cfg.getInt("e8.brute.rate", 20);
        int idle = cfg.getInt("e8.idle.connections", 50);
        List<String> hosts = attackerHosts(4);
        List<String> rows = new ArrayList<>();
        StringBuilder md = new StringBuilder();
        StringBuilder detail = new StringBuilder();
        md.append("## E8 – Bị tấn công (").append(n).append(" chi nhánh thật SALE 2 tin/s ở 127.0.0.1, ")
                .append(calmSec).append(" s bình thường rồi ").append(attackSec).append(" s bị tấn công)\n\n")
                .append("5 kẻ tấn công: dò mật khẩu CN01 (").append(hosts.get(0)).append(", ").append(bruteRate)
                .append(" lần/s), flood PING ").append(floodRate).append(" tin/s (").append(hosts.get(1))
                .append("), cào INVENTORY_GET/HISTORY_GET ").append(scrapeRate).append(" tin/s bằng tài khoản SIM900 (127.0.0.1), ")
                .append("gửi rác ").append(junkRate).append(" dòng/s (").append(hosts.get(2)).append("), mở ").append(idle)
                .append(" kết nối không LOGIN (").append(hosts.get(3)).append(").\n\n")
                .append("| security.mode | Kẻ tấn công bị chặn/ngắt | CN thật bị chặn nhầm | SALE p95 bình thường (ms) | ")
                .append("SALE p95 khi bị tấn công (ms) | SALE mất | Tin tấn công được xử lý |\n")
                .append("|---|---:|---:|---:|---:|---:|---:|\n");
        detail.append("| security.mode | Kẻ tấn công | IP | Tin được xử lý | Tới sự kiện đầu (ms) | Tới khi bị chặn (ms) | Bị chặn bởi |\n")
                .append("|---|---|---|---:|---:|---:|---|\n");
        for (String mode : cfg.get("e8.modes", "off,detect,block").split(",")) {
            System.out.println("  luot security.mode=" + mode);
            List<String> args = serverArgs("e8.server");
            args.add("security.mode=" + mode);
            try (ServerProcess srv = startServer("e8-" + mode, args)) {
                admin.login(cfg.get("e8.admin.user", "admin"), cfg.get("e8.admin.password", "admin123"));
                List<SimClient> cs = new ArrayList<>();
                for (int i = 1; i <= n; i++) {
                    cs.add(new SimClient(sim(i), HOST, PORT, PASSWORD));
                }
                loginAll(cs);
                ConcurrentLinkedQueue<Double> calm = new ConcurrentLinkedQueue<>();
                ConcurrentLinkedQueue<Double> hot = new ConcurrentLinkedQueue<>();
                AtomicInteger saleLost = new AtomicInteger();
                Set<String> falseBlocked = ConcurrentHashMap.newKeySet();
                // vài giây đầu JVM còn khởi động nóng: bán nhưng không tính vào số đo
                long measureFrom = System.currentTimeMillis() + warmupSec * 1000L;
                long attackAt = measureFrom + calmSec * 1000L;
                long end = attackAt + attackSec * 1000L;
                ExecutorService pool = Executors.newFixedThreadPool(n + 8);
                CountDownLatch done = new CountDownLatch(n);
                for (SimClient c : cs) {
                    pool.execute(() -> {
                        long next = System.currentTimeMillis() + ThreadLocalRandom.current().nextLong(500);
                        try {
                            while (System.currentTimeMillis() < end) {
                                long wait = next - System.currentTimeMillis();
                                if (wait > 0) {
                                    Thread.sleep(wait);
                                }
                                next += 500;
                                long t = System.nanoTime();
                                long sentAt = System.currentTimeMillis();
                                c.send(Message.of(Command.SALE, "TB01", 1));
                                Message r = c.await(5000, Command.SALE_OK, Command.ERROR);
                                if (r == null) {
                                    saleLost.incrementAndGet();
                                } else if (r.command() == Command.ERROR) {
                                    if ("E06".equals(r.param(0))) {
                                        falseBlocked.add(c.id + " (E06: " + r.param(1) + ")");
                                    }
                                    saleLost.incrementAndGet();
                                } else if (sentAt >= measureFrom) {
                                    (sentAt < attackAt ? calm : hot).add((System.nanoTime() - t) / 1e6);
                                }
                            }
                        } catch (Exception e) {
                            saleLost.incrementAndGet();
                        } finally {
                            if (!c.isOpen()) {
                                falseBlocked.add(c.id + " (mat ket noi)");
                            }
                            done.countDown();
                        }
                    });
                }
                Thread.sleep(Math.max(0, attackAt - System.currentTimeMillis()));
                List<Attack> attacks = List.of(
                        new Attack("do_mat_khau", hosts.get(0), "LOGIN sai CN01"),
                        new Attack("flood_ping", hosts.get(1), "PING " + floodRate + "/s"),
                        new Attack("cao_du_lieu", HOST, "INVENTORY_GET/HISTORY_GET " + scrapeRate + "/s"),
                        new Attack("gui_rac", hosts.get(2), "dong rac " + junkRate + "/s"),
                        new Attack("khong_login", hosts.get(3), idle + " ket noi khong LOGIN"));
                CountDownLatch attacksDone = new CountDownLatch(attacks.size());
                pool.execute(() -> runAttack(attacksDone, () -> bruteForce(attacks.get(0), bruteRate, end)));
                pool.execute(() -> runAttack(attacksDone, () -> floodPing(attacks.get(1), floodRate, end)));
                pool.execute(() -> runAttack(attacksDone, () -> scrape(attacks.get(2), scrapeRate, end)));
                pool.execute(() -> runAttack(attacksDone, () -> junk(attacks.get(3), junkRate, end)));
                pool.execute(() -> runAttack(attacksDone, () -> idleConnections(attacks.get(4), idle, end)));
                done.await(attackSec + calmSec + 30L, TimeUnit.SECONDS);
                attacksDone.await(30, TimeUnit.SECONDS);
                pool.shutdownNow();
                Thread.sleep(1500); // chờ bộ ghi sự kiện đưa xuống CSDL
                for (SimClient c : cs) {
                    if (!c.isOpen()) {
                        falseBlocked.add(c.id + " (mat ket noi)");
                    }
                }
                for (com.google.gson.JsonElement e : admin.getArray("/api/security/ips")) {
                    JsonObject ip = e.getAsJsonObject();
                    if ("127.0.0.1".equals(ip.get("ip").getAsString()) && "BI_CHAN".equals(ip.get("trangThai").getAsString())) {
                        falseBlocked.add("127.0.0.1 (IP bi chan)");
                    }
                }
                cs.forEach(SimClient::close);
                int blockedCount = 0;
                int handledTotal = 0;
                Stats sCalm = new Stats(calm);
                Stats sHot = new Stats(hot);
                for (Attack a : attacks) {
                    long firstEvent = firstEventAt(a);
                    String tEvent = firstEvent > 0 ? Stats.f1(Math.max(0, firstEvent - a.startedAt)) : "";
                    String tBlock = a.blockedAt > 0 ? Stats.f1(a.blockedAt - a.startedAt) : "";
                    if (a.blockedAt > 0) {
                        blockedCount++;
                    }
                    handledTotal += a.handled.get();
                    // CSV không dùng ngoặc kép: bỏ dấu phẩy khỏi các trường mô tả
                    rows.add(String.join(",", mode, a.name, a.host, a.behaviour.replace(',', ';'), "" + a.handled.get(),
                            tEvent, tBlock, a.blockedAt > 0 ? "1" : "0", a.blockedBy.replace(',', ';'), "" + falseBlocked.size(),
                            Stats.f(sCalm.p95), Stats.f(sHot.p95), "" + saleLost.get()));
                    detail.append("| ").append(mode).append(" | ").append(a.name).append(" | ").append(a.host).append(" | ")
                            .append(a.handled.get()).append(" | ").append(tEvent.isEmpty() ? "—" : tEvent).append(" | ")
                            .append(tBlock.isEmpty() ? "—" : tBlock).append(" | ").append(a.blockedBy.isEmpty() ? "—" : a.blockedBy)
                            .append(" |\n");
                    System.out.printf("    %-12s %-28s xu ly=%d su kien=%s ms chan=%s ms %s%n", a.name, a.host, a.handled.get(),
                            tEvent.isEmpty() ? "-" : tEvent, tBlock.isEmpty() ? "-" : tBlock, a.blockedBy);
                }
                md.append("| ").append(mode).append(" | ").append(blockedCount).append("/").append(attacks.size()).append(" | ")
                        .append(falseBlocked.size()).append(" | ").append(Stats.f(sCalm.p95)).append(" | ")
                        .append(Stats.f(sHot.p95)).append(" | ").append(saleLost.get()).append(" | ").append(handledTotal)
                        .append(" |\n");
                System.out.printf("  %s: chan %d/5, chan nham %d %s, SALE p95 %.2f -> %.2f ms, mat %d%n", mode, blockedCount,
                        falseBlocked.size(), falseBlocked, sCalm.p95, sHot.p95, saleLost.get());
            }
        }
        md.append("\n").append(detail).append("\n\"Tin được xử lý\": số trả lời bình thường kẻ tấn công nhận được (LOGIN_FAIL, PONG, ")
                .append("INVENTORY/HISTORY, ERROR|E01, kết nối được nhận). \"Bị chặn\": nhận ERROR|E06 hoặc bị server đóng kết nối. ")
                .append("Thời gian tính từ lúc kẻ tấn công bắt đầu.\n\n");
        writeCsv("e8.csv", "che_do,ke_tan_cong,ip,hanh_vi,tin_xu_ly,toi_su_kien_ms,toi_khi_bi_chan_ms,bi_chan,bi_chan_boi,"
                + "cn_that_bi_chan_nham,sale_p95_binh_thuong_ms,sale_p95_bi_tan_cong_ms,sale_mat", rows);
        summary.append(md);
    }

    @FunctionalInterface
    private interface AttackBody {
        void run() throws Exception;
    }

    private static void runAttack(CountDownLatch done, AttackBody body) {
        try {
            body.run();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            System.err.println("  loi ke tan cong: " + e.getMessage());
        } finally {
            done.countDown();
        }
    }

    /** Thời điểm (ms) sự kiện an ninh đầu tiên server ghi cho kẻ tấn công này, 0 nếu không có. */
    private long firstEventAt(Attack a) throws IOException, InterruptedException {
        String q = HOST.equals(a.host) ? "loai=SCRAPING" : "ip=" + java.net.URLEncoder.encode(
                java.net.InetAddress.getByName(a.host).getHostAddress(), StandardCharsets.UTF_8);
        long first = 0;
        for (com.google.gson.JsonElement e : admin.getArray("/api/security/events?limit=2000&" + q)) {
            long t = LocalDateTime.parse(e.getAsJsonObject().get("thoiGian").getAsString(),
                    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS"))
                    .atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
            if (t >= a.startedAt - 1000 && (first == 0 || t < first)) {
                first = t;
            }
        }
        return first;
    }

    /** Nối tới host; nhận ERROR|E06 ngay (IP bị chặn) thì ghi là bị chặn. */
    private static RawConn open(Attack a, java.util.function.Consumer<String> onLine) throws IOException {
        return new RawConn(a.host, PORT, line -> {
            if (line.startsWith("ERROR|E06")) {
                a.blocked("E06: " + line.substring(Math.min(line.length(), 10)));
            }
            onLine.accept(line);
        });
    }

    private static void bruteForce(Attack a, int rate, long end) throws Exception {
        a.startedAt = System.currentTimeMillis();
        int i = 0;
        while (System.currentTimeMillis() < end) {
            RawConn c;
            try {
                c = open(a, line -> {
                    if (line.startsWith("LOGIN_FAIL")) {
                        a.handled.incrementAndGet();
                    }
                });
            } catch (IOException e) {
                Thread.sleep(200);
                continue;
            }
            try (c) {
                while (!c.closed && System.currentTimeMillis() < end) {
                    c.send("LOGIN|CN01|doan" + (i++));
                    Thread.sleep(1000L / rate);
                }
                if (c.closed) {
                    a.blocked("server dong ket noi");
                }
            }
            Thread.sleep(300);
        }
    }

    private static void floodPing(Attack a, int rate, long end) throws Exception {
        a.startedAt = System.currentTimeMillis();
        int batch = Math.max(1, rate / 100);
        while (System.currentTimeMillis() < end) {
            RawConn c;
            try {
                c = open(a, line -> {
                    if (line.startsWith("PONG")) {
                        a.handled.incrementAndGet();
                    }
                });
            } catch (IOException e) {
                Thread.sleep(200);
                continue;
            }
            try (c) {
                while (!c.closed && System.currentTimeMillis() < end) {
                    for (int k = 0; k < batch; k++) {
                        c.send("PING");
                    }
                    Thread.sleep(10);
                }
                if (c.closed) {
                    a.blocked("server dong ket noi");
                }
            }
            Thread.sleep(300);
        }
    }

    private static void scrape(Attack a, int rate, long end) throws Exception {
        a.startedAt = System.currentTimeMillis();
        while (System.currentTimeMillis() < end) {
            CountDownLatch in = new CountDownLatch(1);
            RawConn c;
            try {
                c = open(a, line -> {
                    if (line.startsWith("LOGIN_OK")) {
                        in.countDown();
                    } else if (line.startsWith("INVENTORY|") || line.startsWith("HISTORY|")) {
                        a.handled.incrementAndGet();
                    }
                });
            } catch (IOException e) {
                Thread.sleep(200);
                continue;
            }
            try (c) {
                c.send("LOGIN|SIM900|" + PASSWORD);
                if (!in.await(3, TimeUnit.SECONDS)) {
                    Thread.sleep(300);
                    continue;
                }
                long gap = Math.max(1, 1000L / rate);
                int k = 0;
                while (!c.closed && System.currentTimeMillis() < end) {
                    c.send(k++ % 2 == 0 ? "INVENTORY_GET" : "HISTORY_GET|1970-01-01|2100-12-31");
                    Thread.sleep(gap);
                }
                if (c.closed) {
                    a.blocked("server dong ket noi");
                }
            }
            Thread.sleep(300);
        }
    }

    private static void junk(Attack a, int rate, long end) throws Exception {
        a.startedAt = System.currentTimeMillis();
        String big = "X".repeat(5000);
        while (System.currentTimeMillis() < end) {
            RawConn c;
            try {
                c = open(a, line -> {
                    if (line.startsWith("ERROR|E01")) {
                        a.handled.incrementAndGet();
                    }
                });
            } catch (IOException e) {
                Thread.sleep(200);
                continue;
            }
            try (c) {
                int k = 0;
                while (!c.closed && System.currentTimeMillis() < end) {
                    c.send(k % 5 == 4 ? big : "R@C|" + ThreadLocalRandom.current().nextInt() + "|\\x");
                    k++;
                    Thread.sleep(1000L / rate);
                }
                if (c.closed) {
                    a.blocked("server dong ket noi");
                }
            }
            Thread.sleep(300);
        }
    }

    private static void idleConnections(Attack a, int count, long end) throws Exception {
        a.startedAt = System.currentTimeMillis();
        // kết nối → đã bị từ chối bằng ERROR|E06 chưa (bị từ chối thì không tính là "được xử lý")
        Map<RawConn, java.util.concurrent.atomic.AtomicBoolean> conns = new java.util.LinkedHashMap<>();
        try {
            while (System.currentTimeMillis() < end) {
                conns.entrySet().removeIf(e -> {
                    if (!e.getKey().closed) {
                        return false;
                    }
                    if (e.getValue().get()) {
                        a.handled.decrementAndGet();
                    }
                    a.blocked("server dong ket noi");
                    e.getKey().close();
                    return true;
                });
                while (conns.size() < count && System.currentTimeMillis() < end) {
                    java.util.concurrent.atomic.AtomicBoolean rejected = new java.util.concurrent.atomic.AtomicBoolean();
                    try {
                        RawConn c = open(a, line -> {
                            if (line.startsWith("ERROR|E06")) {
                                rejected.set(true);
                            }
                        });
                        conns.put(c, rejected);
                        a.handled.incrementAndGet();
                    } catch (IOException e) {
                        break;
                    }
                }
                Thread.sleep(500);
            }
        } finally {
            conns.keySet().forEach(RawConn::close);
        }
    }

    private static String cell(java.util.Collection<Double> v) {
        Stats s = new Stats(v);
        return s.n == 0 ? "—" : Stats.f1(s.avg) + " / " + Stats.f1(s.p95) + " / " + Stats.f1(s.max);
    }

    private static String csv(java.util.Collection<Double> v) {
        Stats s = new Stats(v);
        return Stats.f(s.avg) + "," + Stats.f(s.p95) + "," + Stats.f(s.max);
    }

    // =====================================================================================

    private ServerProcess startServer(String tag, List<String> args) throws Exception {
        // security.mode=off: 1000 kết nối từ 127.0.0.1 sẽ dính CONN_FLOOD, giữ số liệu E1–E7 so được với trước;
        // E8 ghi đè bằng tham số riêng (tham số sau thắng)
        List<String> all = new ArrayList<>(List.of("max.clients=2000", "db.pool.size=20",
                "tcp.port=" + PORT, "admin.http.port=" + adminPort, "security.mode=off"));
        all.addAll(args);
        ServerProcess p = new ServerProcess(serverJar, outDir.resolve("logs").resolve("server-" + tag + ".log"), all);
        p.awaitReady();
        return p;
    }

    /** Đăng nhập song song, thử lại khi server đang bận. */
    private static void loginAll(List<SimClient> cs) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(cs.size(), 50));
        AtomicInteger fail = new AtomicInteger();
        for (SimClient c : cs) {
            pool.execute(() -> {
                try {
                    relogin(c);
                    if (!c.isOpen()) {
                        fail.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(120, TimeUnit.SECONDS);
        if (fail.get() > 0) {
            throw new IllegalStateException(fail.get() + " client khong dang nhap duoc");
        }
    }

    private static String sim(int i) {
        return String.format("SIM%03d", i);
    }

    private void writeCsv(String name, String header, List<String> rows) throws IOException {
        try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(outDir.resolve(name), StandardCharsets.UTF_8))) {
            w.println(header);
            rows.forEach(w::println);
        }
    }

    private String environment() {
        Runtime rt = Runtime.getRuntime();
        long mem = 0;
        if (ManagementFactory.getOperatingSystemMXBean() instanceof com.sun.management.OperatingSystemMXBean os) {
            mem = os.getTotalMemorySize() / (1024 * 1024 * 1024);
        }
        return String.format(Locale.ROOT, """
                Chạy lúc %s trên một máy (client ảo và server cùng máy, kết nối qua loopback 127.0.0.1).

                | Thông số | Giá trị |
                |---|---|
                | Hệ điều hành | %s %s (%s) |
                | CPU | %d luồng logic |
                | RAM | %d GB |
                | Java | %s |
                | CSDL | PostgreSQL (localhost:5432), pool 20 kết nối |
                """,
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")),
                System.getProperty("os.name"), System.getProperty("os.version"), System.getProperty("os.arch"),
                rt.availableProcessors(), mem, System.getProperty("java.version"));
    }
}
