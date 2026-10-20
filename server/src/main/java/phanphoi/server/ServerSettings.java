package phanphoi.server;

import phanphoi.common.Config;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Các cờ bật/tắt cải tiến để so với baseline trong thực nghiệm (docs/EXPERIMENTS.md).
 * Giá trị mặc định là giải pháp đề xuất; io.mode cố định lúc khởi động, các cờ còn lại đổi được lúc chạy
 * qua API thực nghiệm.
 */
public final class ServerSettings {

    /** Chiến lược trừ kho tổng khi ACCEPT (thực nghiệm E1). */
    public enum AcceptStrategy {
        /** Đề xuất: UPDATE ... WHERE so_luong >= ? (nguyên tử trong CSDL). */
        CONDITIONAL,
        /** Baseline ngây thơ: đọc tồn, kiểm tra trong Java, ghi giá trị mới (lost update). */
        CHECK_THEN_ACT,
        /** Baseline khóa Java: synchronized quanh đọc-kiểm-ghi (đúng nhưng tuần tự hóa, chỉ đúng với 1 server). */
        SYNCHRONIZED
    }

    /** Cách giao tin push cho chi nhánh (thực nghiệm E2). */
    public enum Delivery {
        /** Baseline: gửi được thì gửi, CN offline thì mất. */
        NONE,
        /** Theo SRS: CN offline → hang_doi_tin, gửi lại sau LOGIN_OK. */
        QUEUE,
        /** Đề xuất: QUEUE + gửi lại trạng thái mọi YC còn mở từ CSDL sau LOGIN_OK. */
        QUEUE_RESYNC
    }

    /** Cách ghi ra socket ở server BIO (thực nghiệm E3). */
    public enum WriteMode {
        /** Baseline: luồng gọi send() ghi thẳng vào socket, client chậm làm kẹt luồng gọi. */
        DIRECT,
        /** Đề xuất: hàng đợi gửi có giới hạn + luồng ghi riêng; tràn hàng đợi thì cắt client chậm. */
        QUEUED
    }

    public enum IoMode { BIO, NIO }

    public final IoMode ioMode;
    public volatile AcceptStrategy acceptStrategy;
    public volatile Delivery delivery;
    public volatile WriteMode writeMode;
    /** Giới hạn số tin chờ gửi của một kết nối trước khi bị coi là client chậm. */
    public final int sendQueueLimit;

    public ServerSettings(Config cfg) {
        ioMode = IoMode.valueOf(cfg.get("io.mode", "nio").toUpperCase());
        acceptStrategy = AcceptStrategy.valueOf(cfg.get("accept.strategy", "conditional").toUpperCase());
        delivery = Delivery.valueOf(cfg.get("delivery", "queue_resync").toUpperCase());
        writeMode = WriteMode.valueOf(cfg.get("write.mode", "queued").toUpperCase());
        sendQueueLimit = cfg.getInt("send.queue.limit", 2000);
    }

    public void update(Map<String, String> values) {
        if (values.containsKey("acceptStrategy")) {
            acceptStrategy = AcceptStrategy.valueOf(values.get("acceptStrategy").toUpperCase());
        }
        if (values.containsKey("delivery")) {
            delivery = Delivery.valueOf(values.get("delivery").toUpperCase());
        }
        if (values.containsKey("writeMode")) {
            writeMode = WriteMode.valueOf(values.get("writeMode").toUpperCase());
        }
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ioMode", ioMode.name());
        m.put("acceptStrategy", acceptStrategy.name());
        m.put("delivery", delivery.name());
        m.put("writeMode", writeMode.name());
        m.put("sendQueueLimit", sendQueueLimit);
        return m;
    }
}
