package phanphoi.server.mail;

import org.junit.jupiter.api.Test;
import phanphoi.common.Config;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MailSettingsTest {
    static MailSettings settings(String... overrides) throws Exception {
        String[] args = java.util.stream.Stream.concat(java.util.stream.Stream.of("mail.enabled=true", "mail.smtp.host=127.0.0.1", "mail.smtp.security=none"), java.util.Arrays.stream(overrides)).toArray(String[]::new);
        return MailSettings.from(Config.load("missing-mail-test.properties", args), Map.of());
    }

    @Test
    void environmentOverridesPropertiesAndEmptyRecipientsAreAllowed() throws Exception {
        MailSettings s = MailSettings.from(Config.load("missing-mail-test.properties", new String[]{"mail.enabled=false"}), Map.of(
                "MAIL_ENABLED", "true", "MAIL_SMTP_HOST", "smtp.example.test", "MAIL_SMTP_SECURITY", "ssl", "MAIL_SMTP_PORT", "465",
                "MAIL_ADMIN_RECIPIENTS", "admin@example.test,admin@example.test", "MAIL_BRANCH_RECIPIENTS", "CN01=one@example.test;CN02=two@example.test"));
        assertTrue(s.enabled);
        assertEquals(465, s.port);
        assertEquals(1, s.admins.size());
        assertEquals("two@example.test", s.branches.get("CN02"));
    }

    @Test
    void rejectsMalformedRecipientsAndHeaderInjection() {
        assertThrows(IllegalArgumentException.class, () -> settings("mail.branch.recipients=CN01=bad"));
        assertThrows(IllegalArgumentException.class, () -> settings("mail.branch.recipients=CN01=a@example.test;CN01=b@example.test"));
        assertThrows(IllegalArgumentException.class, () -> MailSettings.mailbox("a@example.test\r\nBcc: b@example.test"));
        assertThrows(IllegalArgumentException.class, () -> MailSettings.mailbox("a@example.test,b@example.test"));
    }

    @Test
    void credentialsRequireTlsAndPortMustBeValid() {
        assertThrows(IllegalArgumentException.class, () -> settings("mail.smtp.username=user", "mail.smtp.password=secret"));
        assertThrows(IllegalArgumentException.class, () -> settings("mail.smtp.port=70000"));
        assertThrows(IllegalArgumentException.class, () -> settings("mail.smtp.security=optional-tls"));
    }

    @Test
    void disabledMailDoesNotRequireCredentialsOrParseUnusedAddresses() throws Exception {
        MailSettings s = MailSettings.from(Config.load("missing-mail-test.properties", new String[]{"mail.enabled=false", "mail.admin.recipients=invalid"}), Map.of());
        assertFalse(s.enabled);
        assertTrue(s.admins.isEmpty());
    }
}
