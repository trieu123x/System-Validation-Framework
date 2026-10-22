package phanphoi.client;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** Đường dẫn trang chi nhánh theo tên: "Chi nhánh Đà Nẵng" → "da-nang", "Chi nhánh TP.HCM" → "tp-hcm". */
final class BranchSlug {

    private static final Pattern PREFIX = Pattern.compile("^\\s*chi\\s+nh[aá]nh\\s+", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    /** Đoạn đường dẫn một cấp có thể là slug (khớp cả khi chưa đăng nhập, xem StaticFiles fallback). */
    static final Pattern PATH = Pattern.compile("^/[a-z0-9]+(-[a-z0-9]+)*/?$");

    private BranchSlug() {
    }

    static String of(String tenCn) {
        if (tenCn == null) {
            return null;
        }
        String s = PREFIX.matcher(tenCn).replaceFirst("");
        s = s.replace('đ', 'd').replace('Đ', 'D');
        s = MARKS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("");
        s = NON_ALNUM.matcher(s.toLowerCase(Locale.ROOT)).replaceAll("-").replaceAll("^-+|-+$", "");
        // tên toàn ký tự lạ, hoặc trùng thư mục của bản build tĩnh: dùng đường dẫn mặc định
        return s.isEmpty() || s.equals("branch") || s.equals("admin") || s.equals("api") || s.startsWith("_") ? "branch" : s;
    }
}
