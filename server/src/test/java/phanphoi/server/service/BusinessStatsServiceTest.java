package phanphoi.server.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import phanphoi.common.web.Http;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Hàm thuần của thống kê kinh doanh, không cần CSDL. */
class BusinessStatsServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 11);

    private static BusinessStatsService.Range range(String from, String to) {
        return new BusinessStatsService.Range(LocalDate.parse(from), LocalDate.parse(to));
    }

    @ParameterizedTest
    @CsvSource({
            "2026-11-11,2026-11-11,day",     // 1 ngày
            "2026-09-11,2026-11-11,day",     // 62 ngày
            "2026-09-10,2026-11-11,week",    // 63 ngày
            "2024-01-01,2024-12-31,week",    // 366 ngày trong một năm (nhuận)
            "2025-11-11,2026-11-11,month",   // 366 ngày qua hai năm
            "2025-12-01,2026-02-28,month",   // 90 ngày qua hai năm
            "2025-12-15,2026-01-14,day"})    // ngắn mà qua năm vẫn theo ngày
    void granularityByRangeLength(String from, String to, String expected) {
        assertEquals(expected, BusinessStatsService.granularity(range(from, to)));
    }

    @Test
    void previousPeriodHasSameLength() {
        var prev = BusinessStatsService.previous(range("2026-11-01", "2026-11-30"));
        assertEquals(LocalDate.of(2026, 10, 2), prev.from());
        assertEquals(LocalDate.of(2026, 10, 31), prev.to());
        assertEquals(30, prev.days());
        var oneDay = BusinessStatsService.previous(range("2026-11-11", "2026-11-11"));
        assertEquals(LocalDate.of(2026, 11, 10), oneDay.from());
        assertEquals(LocalDate.of(2026, 11, 10), oneDay.to());
    }

    @Test
    void abcClassificationUsesCumulativeShare() {
        assertEquals(List.of("A", "A", "B", "B", "C"), BusinessStatsService.abc(List.of(50L, 30L, 10L, 6L, 4L)));
        assertEquals(List.of("A"), BusinessStatsService.abc(List.of(7L)));
        assertEquals(List.of(), BusinessStatsService.abc(List.of()));
        // doanh thu lớn không tràn số
        assertEquals(List.of("A", "B"), BusinessStatsService.abc(List.of(900_000_000_000_000L, 100_000_000_000_000L)));
    }

    @ParameterizedTest
    @CsvSource(value = {
            "2026-11-12,2026-11-01",   // from > to
            "2025-11-01,2026-11-11",   // 376 ngày
            "2026/11/01,2026-11-11",   // sai định dạng
            "2026-11-01,",             // thiếu to
            ",2026-11-11",             // thiếu from
            "2026-11-01,2026-11-13"},  // to ở tương lai quá 1 ngày
            ignoreLeadingAndTrailingWhitespace = false)
    void rejectsInvalidRanges(String from, String to) {
        var e = assertThrows(Http.ApiException.class, () -> BusinessStatsService.parseRange(from, to, TODAY));
        assertEquals(400, e.status());
    }

    @Test
    void acceptsBoundaryRanges() {
        assertEquals(366, BusinessStatsService.parseRange("2025-11-11", "2026-11-11", TODAY).days());
        assertEquals(1, BusinessStatsService.parseRange("2026-11-12", "2026-11-12", TODAY).days());
    }

    @Test
    void projectionLinearForCurrentMonth() {
        assertEquals(30, BusinessStatsService.projection(10, 10, 30));
        assertEquals(0, BusinessStatsService.projection(0, 10, 30));
        assertEquals(0, BusinessStatsService.projection(10, 0, 30));
    }

    @Test
    void ratioIsNullWhenDenominatorIsZero() {
        assertNull(BusinessStatsService.ratio(5, 0));
        assertEquals(0.25, BusinessStatsService.ratio(1, 4));
    }
}
