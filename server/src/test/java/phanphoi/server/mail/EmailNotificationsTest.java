package phanphoi.server.mail;

import org.junit.jupiter.api.Test;
import phanphoi.server.security.SecurityEvent;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class EmailNotificationsTest {
    private static SecurityEvent event(String type, String branch) {
        return new SecurityEvent(LocalDateTime.of(2026, 10, 26, 12, 0), "SERVER", type, "HIGH", "192.0.2.4", branch, "Dang nhap can kiem tra", "GHI_NHAN");
    }

    @Test
    void disabledMailNeverCallsSender() {
        try (EmailNotifications mail = new EmailNotifications(MailSettings.disabled(), message -> fail("SMTP must not run"), System::currentTimeMillis)) {
            assertEquals(0, mail.noticeCreated(1, "TIN", "Tin", "Body", List.of("CN01")));
            mail.onSecurityEvent(event("BRUTE_FORCE", "CN01"));
            assertEquals(0L, mail.status().get("queued"));
        }
    }

    @Test
    void sendsOnlySelectedMappedBranchesAndDoesNotDuplicateNotice() throws Exception {
        List<EmailMessage> received = new CopyOnWriteArrayList<>();
        try (EmailNotifications mail = new EmailNotifications(MailSettingsTest.settings("mail.branch.recipients=CN01=one@example.test;CN02=two@example.test"), received::add, System::currentTimeMillis)) {
            assertEquals(1, mail.noticeCreated(10, "TIN", "Thông báo\r\nBcc: other", "Nội dung tiếng Việt", List.of("CN01", "CN01", "CN03")));
            assertEquals(0, mail.noticeCreated(10, "TIN", "Tin", "Nội dung", List.of("CN01")));
        }
        assertEquals(1, received.size());
        assertEquals("one@example.test", received.get(0).to());
        assertTrue(received.get(0).body().contains("Nội dung tiếng Việt"));
        assertFalse(received.get(0).subject().contains("\n"));
    }

    @Test
    void alertsGoToAdminAndAffectedBranchWithCooldown() throws Exception {
        List<EmailMessage> received = new CopyOnWriteArrayList<>();
        AtomicLong time = new AtomicLong(1000);
        try (EmailNotifications mail = new EmailNotifications(MailSettingsTest.settings("mail.admin.recipients=admin@example.test", "mail.branch.recipients=CN01=one@example.test", "mail.alert.cooldown.seconds=2"), received::add, time::get)) {
            mail.onSecurityEvent(event("BRUTE_FORCE", "CN01"));
            mail.onSecurityEvent(event("BRUTE_FORCE", "CN01"));
            mail.onSecurityEvent(event("CMD_FLOOD", "CN01"));
            assertEquals(2L, mail.status().get("queued"));
            time.addAndGet(2001);
            mail.onSecurityEvent(event("BRUTE_FORCE", "CN01"));
            assertEquals(4L, mail.status().get("queued"));
        }
        assertEquals(4, received.size());
        assertEquals(java.util.Set.of("admin@example.test", "one@example.test"), received.stream().map(EmailMessage::to).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void retriesTransientFailureOnWorkerAndCountsPermanentFailure() throws Exception {
        AtomicInteger tries = new AtomicInteger();
        CountDownLatch sent = new CountDownLatch(1);
        try (EmailNotifications mail = new EmailNotifications(MailSettingsTest.settings("mail.branch.recipients=CN01=one@example.test"), message -> {
            assertEquals("email-sender", Thread.currentThread().getName());
            if (tries.incrementAndGet() < 2) throw new java.io.IOException("temporary");
            sent.countDown();
        }, System::currentTimeMillis)) {
            mail.noticeCreated(1, "TIN", "Tin", "Body", List.of("CN01"));
            assertTrue(sent.await(3, TimeUnit.SECONDS));
        }
        assertEquals(2, tries.get());
        EmailNotifications permanent = new EmailNotifications(MailSettingsTest.settings("mail.branch.recipients=CN01=one@example.test", "mail.attempts=1"), message -> { throw new java.io.IOException("permanent"); }, System::currentTimeMillis);
        permanent.noticeCreated(2, "TIN", "Tin", "Body", List.of("CN01"));
        permanent.close();
        assertEquals(1L, permanent.status().get("failed"));
    }

    @Test
    void fullQueueReturnsImmediatelyAndRejectedMessageCanBeRetried() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch delivered = new CountDownLatch(2);
        EmailNotifications mail = new EmailNotifications(MailSettingsTest.settings("mail.branch.recipients=CN01=one@example.test", "mail.queue.size=1"), message -> {
            entered.countDown();
            assertTrue(release.await(3, TimeUnit.SECONDS));
            delivered.countDown();
        }, System::currentTimeMillis);
        try {
            assertEquals(1, mail.noticeCreated(1, "TIN", "1", "Body", List.of("CN01")));
            assertTrue(entered.await(1, TimeUnit.SECONDS));
            assertEquals(1, mail.noticeCreated(2, "TIN", "2", "Body", List.of("CN01")));
            assertEquals(0, mail.noticeCreated(3, "TIN", "3", "Body", List.of("CN01")));
            assertEquals(1L, mail.status().get("rejected"));
            release.countDown();
            assertTrue(delivered.await(2, TimeUnit.SECONDS));
            assertEquals(1, mail.noticeCreated(3, "TIN", "3", "Body", List.of("CN01")), "Queue rejection must not reserve dedupe key");
        } finally {
            release.countDown();
            mail.close();
        }
        assertEquals(0, mail.noticeCreated(4, "TIN", "4", "Body", List.of("CN01")));
        assertEquals(2L, mail.status().get("rejected"));
        assertFalse(mail.status().containsKey("password"));
    }
}
