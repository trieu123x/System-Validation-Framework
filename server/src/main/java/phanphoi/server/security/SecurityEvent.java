package phanphoi.server.security;

import phanphoi.server.db.Db;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Một sự kiện an ninh (bảng su_kien_bao_mat).
 *
 * @param nguon    SERVER | CLIENT | ADMIN
 * @param muc      LOW | MEDIUM | HIGH
 * @param hanhDong GHI_NHAN | CHAN_IP | NGAT | GIOI_HAN | KHOA_TK
 */
public record SecurityEvent(LocalDateTime thoiGian, String nguon, String loai, String muc, String ip, String maCn,
                            String chiTiet, String hanhDong, String eventKey, Map<String, Object> metadata) {
    public SecurityEvent(LocalDateTime time, String source, String type, String severity, String ip, String branch, String detail, String action) {
        this(time, source, type, severity, ip, branch, detail, action, java.util.UUID.randomUUID().toString(), Map.of());
    }
    public SecurityEvent { metadata = Map.copyOf(metadata); }


    public static final String SERVER = "SERVER";
    public static final String CLIENT = "CLIENT";
    public static final String ADMIN = "ADMIN";

    public static final String LOW = "LOW";
    public static final String MEDIUM = "MEDIUM";
    public static final String HIGH = "HIGH";

    public static final String GHI_NHAN = "GHI_NHAN";
    public static final String CHAN_IP = "CHAN_IP";
    public static final String NGAT = "NGAT";
    public static final String GIOI_HAN = "GIOI_HAN";
    public static final String KHOA_TK = "KHOA_TK";

    /** Dạng JSON cho SSE "security" và API, cùng tên trường với Db.toMap(). */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("eventKey", eventKey);
        m.put("metadata", metadata);
        m.put("thoiGian", thoiGian.format(Db.TIME_FORMAT));
        m.put("nguon", nguon);
        m.put("loai", loai);
        m.put("muc", muc);
        m.put("ip", ip);
        m.put("maCn", maCn);
        m.put("chiTiet", chiTiet);
        m.put("hanhDong", hanhDong);
        return m;
    }
}
