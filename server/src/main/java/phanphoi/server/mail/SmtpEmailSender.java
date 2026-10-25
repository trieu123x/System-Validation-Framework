package phanphoi.server.mail;

import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

import java.util.Date;
import java.util.Properties;

/** Angus/Jakarta Mail: UTF-8, timeout hữu hạn, xác minh chứng chỉ và yêu cầu TLS khi cấu hình STARTTLS. */
public final class SmtpEmailSender implements EmailSender {
    private final MailSettings settings;
    private final Session session;

    public SmtpEmailSender(MailSettings settings) {
        this.settings = settings;
        Properties p = new Properties();
        p.setProperty("mail.smtp.host", settings.host);
        p.setProperty("mail.smtp.port", Integer.toString(settings.port));
        p.setProperty("mail.smtp.auth", Boolean.toString(!settings.username.isEmpty()));
        p.setProperty("mail.smtp.starttls.enable", Boolean.toString(settings.security.equals("starttls")));
        p.setProperty("mail.smtp.starttls.required", Boolean.toString(settings.security.equals("starttls")));
        p.setProperty("mail.smtp.ssl.enable", Boolean.toString(settings.security.equals("ssl")));
        p.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        p.setProperty("mail.smtp.connectiontimeout", Integer.toString(settings.timeoutMs));
        p.setProperty("mail.smtp.timeout", Integer.toString(settings.timeoutMs));
        p.setProperty("mail.smtp.writetimeout", Integer.toString(settings.timeoutMs));
        session = Session.getInstance(p, settings.username.isEmpty() ? null : new Authenticator() {
            @Override
            protected PasswordAuthentication getPasswordAuthentication() {
                return new PasswordAuthentication(settings.username, settings.password);
            }
        });
    }

    @Override
    public void send(EmailMessage email) throws Exception {
        MimeMessage message = new MimeMessage(session);
        message.setFrom(new InternetAddress(settings.from));
        message.setRecipient(Message.RecipientType.TO, new InternetAddress(email.to()));
        message.setSubject(email.subject(), "UTF-8");
        message.setText(email.body(), "UTF-8");
        message.setSentDate(new Date());
        message.saveChanges();
        Transport transport = session.getTransport("smtp");
        try {
            transport.connect(settings.host, settings.port,
                    settings.username.isEmpty() ? null : settings.username,
                    settings.username.isEmpty() ? null : settings.password);
            transport.sendMessage(message, message.getAllRecipients());
        } finally {
            // SMTP đã trả kết quả DATA; lỗi QUIT không nên khiến gửi lại thư đã được chấp nhận.
            try {
                transport.close();
            } catch (jakarta.mail.MessagingException ignored) {
                // kết nối có thể đã đóng vì lỗi trước đó
            }
        }
    }
}
