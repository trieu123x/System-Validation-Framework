package phanphoi.server.mail;

import java.util.Objects;

/** Mỗi email chỉ có một người nhận để không lộ địa chỉ các chi nhánh khác. */
public record EmailMessage(String to, String subject, String body) {
    public EmailMessage {
        to = MailSettings.mailbox(Objects.requireNonNull(to));
        subject = Objects.requireNonNull(subject).replace('\r', ' ').replace('\n', ' ');
        body = Objects.requireNonNull(body);
    }
}
