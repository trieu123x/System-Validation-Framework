package phanphoi.server.service;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class NoticeServiceTest {

    @Test
    void repliesDependOnType() {
        assertEquals(Set.of("XEM"), NoticeService.repliesFor("TIN"));
        assertEquals(Set.of("XEM", "CAN_HANG", "KHONG_CAN"), NoticeService.repliesFor("HOI_NHU_CAU"));
        assertEquals(Set.of("XEM", "MUON_NHAP", "BO_QUA"), NoticeService.repliesFor("SP_MOI"));
        // trả lời chéo loại bị từ chối
        assertFalse(NoticeService.repliesFor("HOI_NHU_CAU").contains("MUON_NHAP"));
        assertFalse(NoticeService.repliesFor("SP_MOI").contains("CAN_HANG"));
    }

    @Test
    void validTypes() {
        assertTrue(NoticeService.validType("TIN"));
        assertTrue(NoticeService.validType("SP_MOI"));
        assertFalse(NoticeService.validType("tin"));
        assertFalse(NoticeService.validType(""));
        assertFalse(NoticeService.validType(null));
    }

    @Test
    void onlyYesAnswersNeedQuantity() {
        assertTrue(NoticeService.needsQuantity("CAN_HANG"));
        assertTrue(NoticeService.needsQuantity("MUON_NHAP"));
        assertFalse(NoticeService.needsQuantity("KHONG_CAN"));
        assertFalse(NoticeService.needsQuantity("BO_QUA"));
        assertFalse(NoticeService.needsQuantity("XEM"));
    }

    @Test
    void answeredStatesAreFinal() {
        assertFalse(NoticeService.answered("DA_GUI"));
        assertFalse(NoticeService.answered("DA_XEM"));
        for (String s : new String[]{"CAN_HANG", "KHONG_CAN", "MUON_NHAP", "BO_QUA"}) {
            assertTrue(NoticeService.answered(s), s);
        }
    }

    @Test
    void suggestQuantityLikeWarehousePage() {
        assertEquals(2, NoticeService.suggestQuantity(4, 3));   // 2 × 3 − 4
        assertEquals(6, NoticeService.suggestQuantity(0, 3));
        assertEquals(1, NoticeService.suggestQuantity(10, 3));  // đủ hàng vẫn đề xuất tối thiểu 1
    }

    @Test
    void longVietnameseBodyMustFitOneLine() {
        assertTrue(NoticeService.fitsLine("Sản phẩm mới: Máy xoa vữa 600 mm", "Giá xuất 5.865.000 đ | giao từ 01/11"));
        // 1000 ký tự tiếng Việt có dấu (2–3 byte) + ký tự thoát vẫn vừa 4096 byte
        assertTrue(NoticeService.fitsLine("x".repeat(150), "ữ".repeat(1000)));
        // nhiều ký tự | (mỗi ký tự thành \p khi thoát) có thể làm tràn dòng
        assertFalse(NoticeService.fitsLine("x".repeat(150), "ữ|".repeat(1000)));
    }

    @Test
    void imageRefStripsCloudinaryPrefixOnly() {
        assertEquals("v1792609532/toboki/TB01.webp",
                StockService.imageRef("https://res.cloudinary.com/dfnlbrk4w/image/upload/v1792609532/toboki/TB01.webp"));
        assertEquals("", StockService.imageRef(null));
        assertEquals("https://example.com/a.png", StockService.imageRef("https://example.com/a.png"));
        // cloud khác giữ nguyên URL đầy đủ (giao diện chỉ biết ghép vào cloud của dự án)
        String other = "https://res.cloudinary.com/othercloud/image/upload/v1/toboki/TB01.webp";
        assertEquals(other, StockService.imageRef(other));
    }
}
