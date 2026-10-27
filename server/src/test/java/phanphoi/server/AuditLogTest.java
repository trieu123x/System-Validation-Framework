package phanphoi.server;

import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.Message;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AuditLogTest {
    @Test void saleHasProductAndQuantity() {
        assertEquals("maSp=SP001; soLuong=3", AuditLog.tcpDetail(Message.of(Command.SALE, "SP001", 3)));
    }

    @Test void noticeReplyDoesNotLogFreeText() {
        String detail = AuditLog.tcpDetail(Message.of(Command.NOTICE_REPLY, "12", "MUON_NHAP", 8));
        assertTrue(detail.contains("noticeId=12"));
        assertTrue(detail.contains("soLuong=8"));
        assertFalse(detail.contains("MUON_NHAP"));
    }

    @Test void rejectsUnsafeRouteIdentifiers() {
        assertEquals("/api/requests/{id}/ship id=[redacted]",
                AuditLog.routeDetail("/api/requests/{id}/ship", List.of("\r\nsecret")));
    }

    @Test void loginNeverGetsCredentialDetails() {
        assertEquals("", AuditLog.tcpDetail(Message.of(Command.LOGIN, "user@example.org", "secret")));
    }
}
