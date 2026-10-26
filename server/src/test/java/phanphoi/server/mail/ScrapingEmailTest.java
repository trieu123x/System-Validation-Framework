package phanphoi.server.mail;

import org.junit.jupiter.api.Test;
import phanphoi.server.security.SecurityEvent;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;

class ScrapingEmailTest {
    private static SecurityEvent event(String branch, String severity, String action) {
        return new SecurityEvent(LocalDateTime.now(), "SERVER", "SCRAPING", severity, "192.0.2.1", branch,
                "password=DO_NOT_INCLUDE", action, UUID.randomUUID().toString(), Map.of("channel","TCP","resource","INVENTORY_GET","riskScore",75));
    }
    @Test void adminAndAffectedBranchOnlyWithDedupAndEscalation() throws Exception {
        List<EmailMessage> emails=new CopyOnWriteArrayList<>();
        List<String> audit=new CopyOnWriteArrayList<>();
        AtomicLong now=new AtomicLong(1000);
        try(var mail=new EmailNotifications(MailSettingsTest.settings("mail.admin.recipients=admin@example.test",
                "mail.branch.recipients=CN01=one@example.test;CN02=two@example.test"),emails::add,now::get)) {
            mail.audit((id,to,status,attempts)->audit.add(status));
            for(int i=0;i<100;i++)mail.onSecurityEvent(event("CN01","MEDIUM","GIOI_HAN"));
            assertEquals(2L,mail.status().get("queued"));
            mail.onSecurityEvent(event("CN01","HIGH","KHOA_TK"));
            assertEquals(4L,mail.status().get("queued"));
        }
        assertEquals(4,emails.size());
        assertTrue(emails.stream().noneMatch(e->e.to().equals("two@example.test") || e.body().contains("DO_NOT_INCLUDE")));
        assertTrue(audit.containsAll(List.of("QUEUED","SENT","SUPPRESSED")));
    }
    @Test void observationDoesNotEmailAndClientTextIsNeverMailed() throws Exception {
        List<EmailMessage> emails=new CopyOnWriteArrayList<>();
        try(var mail=new EmailNotifications(MailSettingsTest.settings("mail.admin.recipients=admin@example.test"),emails::add,System::currentTimeMillis)) {
            mail.onSecurityEvent(event("CN01","MEDIUM","GHI_NHAN"));
            assertEquals(0L,mail.status().get("queued"));
            mail.onSecurityEvent(new SecurityEvent(LocalDateTime.now(),"CLIENT","CLIENT_SCRAPING","MEDIUM","192.0.2.1","CN01",
                    "evil@other.test\r\nSecretCustomer", "GHI_NHAN"));
        }
        assertEquals(1,emails.size());
        assertFalse(emails.get(0).body().contains("SecretCustomer"));
        assertTrue(emails.get(0).body().contains("chưa xác minh"));
    }
    @Test void hourlyCapAcrossBranches() throws Exception {
        List<EmailMessage> emails=new CopyOnWriteArrayList<>();
        try(var mail=new EmailNotifications(MailSettingsTest.settings("mail.admin.recipients=admin@example.test",
                "scraping.email.max.per.recipient.hour=2"),emails::add,System::currentTimeMillis)) {
            mail.onSecurityEvent(event("CN01","HIGH","KHOA_TK"));
            mail.onSecurityEvent(event("CN02","HIGH","KHOA_TK"));
            mail.onSecurityEvent(event("CN03","HIGH","KHOA_TK"));
            assertEquals(2L,mail.status().get("queued"));
            assertEquals(1L,mail.status().get("skipped"));
        }
        assertEquals(2,emails.size());
    }
}
