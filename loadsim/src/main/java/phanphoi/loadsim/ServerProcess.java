package phanphoi.loadsim;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Khởi động server.jar như tiến trình con với cấu hình biến thể, chờ sẵn sàng, ghi log ra file. */
final class ServerProcess implements AutoCloseable {

    private final Process process;
    private final CountDownLatch tcpReady = new CountDownLatch(1);
    private final CountDownLatch ready = new CountDownLatch(1);
    private volatile long tcpReadyAt;

    ServerProcess(Path serverJar, Path logFile, List<String> overrides) throws IOException {
        String java = ProcessHandle.current().info().command().orElse("java");
        List<String> cmd = new ArrayList<>(List.of(java, "-jar", serverJar.toString(),
                "open.browser=false", "log.quiet=true", "discovery.enabled=false"));
        cmd.addAll(overrides);
        Files.createDirectories(logFile.getParent());
        process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        PrintWriter log = new PrintWriter(Files.newBufferedWriter(logFile, StandardCharsets.UTF_8), true);
        log.println("# " + String.join(" ", cmd));
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    log.println(line);
                    if (line.contains("lang nghe cong") && tcpReady.getCount() > 0) {
                        tcpReadyAt = System.currentTimeMillis();
                        tcpReady.countDown();
                    }
                    if (line.contains("san sang")) {
                        ready.countDown();
                    }
                }
            } catch (IOException ignored) {
                // tiến trình kết thúc
            } finally {
                log.close();
            }
        }, "server-log");
        t.setDaemon(true);
        t.start();
    }

    void awaitReady() throws InterruptedException {
        if (!ready.await(60, TimeUnit.SECONDS)) {
            throw new IllegalStateException("server khong khoi dong duoc, xem log");
        }
    }

    /** Thời điểm cổng TCP bắt đầu nhận kết nối. */
    long tcpReadyAt() {
        return tcpReadyAt;
    }

    /** Tắt đột ngột như mất điện (không chạy shutdown hook). */
    void kill() throws InterruptedException {
        process.destroyForcibly();
        process.waitFor(10, TimeUnit.SECONDS);
    }

    @Override
    public void close() throws InterruptedException {
        if (process.isAlive()) {
            kill();
        }
    }
}
