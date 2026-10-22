package phanphoi.client;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BranchSlugTest {

    @Test
    void dropsPrefixAndDiacritics() {
        assertEquals("linh-nam", BranchSlug.of("Chi nhánh Lĩnh Nam"));
        assertEquals("da-nang", BranchSlug.of("Chi nhánh Đà Nẵng"));
        assertEquals("tp-hcm", BranchSlug.of("Chi nhánh TP.HCM"));
        assertEquals("buon-ma-thuot", BranchSlug.of("Chi nhánh Buôn Ma Thuột"));
        assertEquals("hai-phong", BranchSlug.of("CHI NHÁNH  Hải Phòng"));
    }

    @Test
    void nameWithoutPrefixKeepsAllWords() {
        assertEquals("kho-ha-dong", BranchSlug.of("Kho Hà Đông"));
    }

    @Test
    void unusableNamesFallBackToBranch() {
        assertNull(BranchSlug.of(null));
        assertEquals("branch", BranchSlug.of("Chi nhánh ???"));
        // không được trùng thư mục admin/ hay api/ của client.jar
        assertEquals("branch", BranchSlug.of("Chi nhánh Admin"));
        assertEquals("branch", BranchSlug.of("API"));
    }

    @Test
    void slugPathPatternMatchesOnlyOneSegment() {
        assertTrue(BranchSlug.PATH.matcher("/da-nang/").matches());
        assertTrue(BranchSlug.PATH.matcher("/tp-hcm").matches());
        assertFalse(BranchSlug.PATH.matcher("/").matches());
        assertFalse(BranchSlug.PATH.matcher("/_next/static/x.js").matches());
        assertFalse(BranchSlug.PATH.matcher("/da-nang/../admin/").matches());
        assertFalse(BranchSlug.PATH.matcher("/Da-Nang/").matches());
    }
}
