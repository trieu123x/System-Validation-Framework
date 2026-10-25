package phanphoi.server.mail;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class SmtpEmailSenderTest {
    @Test
    void sendsRealSmtpWithUtf8AndSingleRecipient() throws Exception {
        CompletableFuture<String> captured = new CompletableFuture<>();
        java.util.concurrent.atomic.AtomicReference<String> phase = new java.util.concurrent.atomic.AtomicReference<>("accept");
        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            server.setSoTimeout(30000);
            MailSettings settings = MailSettingsTest.settings("mail.smtp.port=" + server.getLocalPort());
            assertEquals(server.getLocalPort(), settings.port);
            assertEquals("127.0.0.1", settings.host);
            // Nạp provider trước khi bắt đầu hạn chờ accept của bộ nhận thử.
            SmtpEmailSender sender = new SmtpEmailSender(settings);
            Thread smtp = new Thread(() -> {
                try (var socket = server.accept()) {
                    phase.set("accepted");
                    socket.setSoTimeout(5000);
                    BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
                    PrintWriter out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.ISO_8859_1), true);
                    out.print("220 localhost test SMTP\r\n"); out.flush();
                    phase.set("greeting sent, error=" + out.checkError());
                    String line;
                    while ((line = in.readLine()) != null) {
                        if (line.startsWith("EHLO") || line.startsWith("HELO")) out.print("250 localhost\r\n");
                        else if (line.startsWith("MAIL FROM:")) out.print("250 OK\r\n");
                        else if (line.startsWith("RCPT TO:")) {
                            if (!line.contains("branch@example.test")) throw new AssertionError("Unexpected recipient");
                            out.print("250 OK\r\n");
                        } else if (line.equals("DATA")) {
                            out.print("354 End with dot\r\n"); out.flush();
                            StringBuilder body = new StringBuilder();
                            while ((line = in.readLine()) != null && !line.equals(".")) body.append(line.startsWith("..") ? line.substring(1) : line).append("\r\n");
                            captured.complete(body.toString());
                            out.print("250 accepted\r\n");
                        } else if (line.equals("QUIT")) { out.print("221 bye\r\n"); out.flush(); break; }
                        else out.print("250 OK\r\n");
                        out.flush();
                    }
                } catch (Throwable e) {
                    phase.set("listener error: " + e);
                    captured.completeExceptionally(e);
                }
            }, "smtp-test");
            smtp.setDaemon(true);
            smtp.start();
            try {
                sender.send(
                        new EmailMessage("branch@example.test", "Thông báo: hàng mới", "Chi nhánh cần xác nhận đã nhận hàng.\nDòng thứ hai."));
            } catch (Exception e) {
                throw new AssertionError("SMTP test listener: " + phase.get(), e);
            }
            MimeMessage received = new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(captured.get(5, TimeUnit.SECONDS).getBytes(StandardCharsets.ISO_8859_1)));
            assertEquals("Thông báo: hàng mới", received.getSubject());
            assertTrue(received.getContent().toString().contains("Chi nhánh cần xác nhận đã nhận hàng."));
            assertEquals(1, received.getAllRecipients().length);
            assertNull(received.getHeader("Bcc"));
            smtp.join(1000);
        }
    }
}
