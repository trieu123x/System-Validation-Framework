package phanphoi.client;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.Protocol;
import phanphoi.common.web.Http;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class LoginBlockingTest {
    @Test @Timeout(40)
    void sharedGatewayBlocksOnlyIpAndBranchAcrossCookiesAndKeepsActiveSession() throws Exception {
        var workers = Executors.newCachedThreadPool(runnable -> { Thread thread = new Thread(runnable); thread.setDaemon(true); return thread; });
        try (var tcp = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            var wrongPasswords = new AtomicInteger();
            workers.submit(() -> {
                try {
                    while (!tcp.isClosed()) {
                        var socket = tcp.accept();
                        workers.submit(() -> {
                            try (socket; var reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                                 var writer = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true)) {
                                String line;
                                while ((line = reader.readLine()) != null) {
                                    Message message = Protocol.decode(line);
                                    if (message.command() == Command.LOGIN) {
                                        if (message.param(0).equals("CN07")) writer.println(Message.of(Command.LOGIN_BLOCKED, 60).toLine());
                                        else if (message.param(1).equals("correct-test-password")) writer.println(Message.of(Command.LOGIN_OK, message.param(0), "Test Branch").toLine());
                                        else { wrongPasswords.incrementAndGet(); writer.println(Message.of(Command.LOGIN_FAIL, Protocol.LOGIN_FAIL_WRONG).toLine()); }
                                    } else if (message.command() == Command.PING) writer.println(Message.of(Command.PONG).toLine());
                                }
                            } catch (Exception ignored) { }
                        });
                    }
                } catch (IOException ignored) { }
            });
            int port;
            try (var reserved = new ServerSocket(0)) { port = reserved.getLocalPort(); }
            String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
            Process gateway = new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"), ClientMain.class.getName(),
                    "--config=missing-login-test.properties", "http.host=127.0.0.1", "http.port=" + port,
                    "server=127.0.0.1:" + tcp.getLocalPort(), "open.browser=false", "scraping.mode=off",
                    "security.login.fail.max=5", "security.login.fail.window.seconds=60", "security.login.block.seconds=60")
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            try {
                var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
                String base = "http://127.0.0.1:" + port;
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                while (true) {
                    try { http.send(HttpRequest.newBuilder(URI.create(base + "/api/config")).GET().build(), HttpResponse.BodyHandlers.ofString()); break; }
                    catch (IOException e) { if (System.nanoTime() >= deadline) throw e; Thread.sleep(50); }
                }
                var active = login(http, base, "CN01", "correct-test-password", "");
                assertEquals(200, active.statusCode());
                String cookie = active.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
                for (int i = 1; i <= 5; i++) {
                    var response = login(http, base, i % 2 == 0 ? "cn06" : "CN06", "wrong-password", "unrelated=" + i);
                    assertEquals(i < 5 ? 401 : 429, response.statusCode());
                    if (i == 5) {
                        assertEquals("60", response.headers().firstValue("Retry-After").orElseThrow());
                        assertTrue(response.body().contains("IP"));
                    }
                }
                assertEquals(5, wrongPasswords.get());
                assertEquals(429, login(http, base, " CN06 ", "correct-test-password", "different-browser=1").statusCode());
                assertEquals(5, wrongPasswords.get(), "Blocked attempts must not reach the company server");
                assertEquals(200, login(http, base, "CN04", "correct-test-password", "").statusCode(), "CN04 must remain available on the same IP");
                assertEquals(429, login(http, base, "CN06", "correct-test-password", "").statusCode(), "CN04 success must not clear CN06 lock");
                var upstreamLock = login(http, base, "CN07", "correct-test-password", "");
                assertEquals(429, upstreamLock.statusCode());
                assertEquals("60", upstreamLock.headers().firstValue("Retry-After").orElseThrow());
                var current = http.send(HttpRequest.newBuilder(URI.create(base + "/api/state")).header("Cookie", cookie).GET().build(), HttpResponse.BodyHandlers.ofString());
                assertEquals(200, current.statusCode());
                assertTrue(current.body().contains("CN01"), "Active session survives sign-in IP ban");
            } finally {
                gateway.destroy();
                if (!gateway.waitFor(3, TimeUnit.SECONDS)) gateway.destroyForcibly().waitFor();
                tcp.close();
            }
        } finally { workers.shutdownNow(); }
    }

    private HttpResponse<String> login(HttpClient http, String base, String branch, String password, String cookie) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + "/api/login")).timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json").header("X-Forwarded-For", "192.0.2." + cookie.length());
        if (!cookie.isEmpty()) request.header("Cookie", cookie);
        return http.send(request.POST(HttpRequest.BodyPublishers.ofString(Http.GSON.toJson(java.util.Map.of("maCn", branch, "matKhau", password)))).build(), HttpResponse.BodyHandlers.ofString());
    }
}
