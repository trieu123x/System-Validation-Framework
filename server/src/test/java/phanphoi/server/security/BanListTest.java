package phanphoi.server.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BanListTest {

    private static final long T0 = 1_800_000_000_000L;

    @Test
    void banAndExpire() {
        BanList b = new BanList();
        long until = b.ban("10.0.0.5", 10, T0);
        assertEquals(T0 + 600_000, until);
        assertTrue(b.isBanned("10.0.0.5", T0 + 599_999));
        assertFalse(b.isBanned("10.0.0.6", T0));
        assertFalse(b.isBanned("10.0.0.5", T0 + 600_000));
        // mục hết hạn bị xoá khỏi danh sách
        assertTrue(b.active(T0 + 600_000).isEmpty());
    }

    @Test
    void unban() {
        BanList b = new BanList();
        b.ban("10.0.0.5", 10, T0);
        assertTrue(b.unban("10.0.0.5"));
        assertFalse(b.isBanned("10.0.0.5", T0 + 1));
        assertFalse(b.unban("10.0.0.5"));
    }

    @Test
    void banAgainExtendsRemaining() {
        BanList b = new BanList();
        b.ban("10.0.0.5", 10, T0);
        // chặn lại khi còn 5 phút: cộng dồn thành 15 phút kể từ lúc này
        long until = b.ban("10.0.0.5", 10, T0 + 300_000);
        assertEquals(T0 + 1_200_000, until);
        assertEquals(T0 + 1_200_000, b.bannedUntil("10.0.0.5", T0 + 300_000));
    }

    @Test
    void banAgainAfterExpiryStartsFromNow() {
        BanList b = new BanList();
        b.ban("10.0.0.5", 1, T0);
        assertEquals(T0 + 120_000 + 60_000, b.ban("10.0.0.5", 1, T0 + 120_000));
    }
}
