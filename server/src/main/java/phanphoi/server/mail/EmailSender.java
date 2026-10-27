package phanphoi.server.mail;

@FunctionalInterface
public interface EmailSender {
    void send(EmailMessage message) throws Exception;
}
