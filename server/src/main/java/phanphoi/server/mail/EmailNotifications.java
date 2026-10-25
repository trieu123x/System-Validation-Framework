package phanphoi.server.mail;

import phanphoi.server.security.SecurityEvent;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/** Email bổ sung cho TCP/NOTICE: không gửi SMTP trên luồng Selector, HTTP hay transaction DB. */
public final class EmailNotifications implements AutoCloseable {
    private static final Set<String> LOGIN_ALERTS = Set.of("BRUTE_FORCE", "CRED_STUFFING", "ADMIN_BRUTE_FORCE", "LOGIN_NEW_IP");
    private static final int MAX_DEDUPE = 10000;
    private final MailSettings settings;
    private final EmailSender sender;
    private final LongSupplier clock;
    private final ThreadPoolExecutor worker;
    private final Map<String, Long> acceptedUntil = new LinkedHashMap<>();
    private final AtomicLong queued = new AtomicLong();
    private final AtomicLong sent = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private final AtomicLong skipped = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();

    public EmailNotifications(MailSettings settings) {
        this(settings, settings.enabled ? new SmtpEmailSender(settings) : email -> { }, System::currentTimeMillis);
    }

    EmailNotifications(MailSettings settings, EmailSender sender, LongSupplier clock) {
        this.settings = settings;
        this.sender = sender;
        this.clock = clock;
        worker = settings.enabled ? new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(settings.queueSize), r -> {
                    Thread t = new Thread(r, "email-sender");
                    t.setDaemon(true);
                    return t;
                }, new ThreadPoolExecutor.AbortPolicy()) : null;
    }

    public static EmailNotifications disabled() {
        return new EmailNotifications(MailSettings.disabled());
    }

    public boolean enabled() {
        return settings.enabled;
    }

    public void onSecurityEvent(SecurityEvent event) {
        if (!enabled() || !LOGIN_ALERTS.contains(event.loai())) return;
        Set<String> recipients = new LinkedHashSet<>(settings.admins);
        String branchEmail = event.maCn() == null ? null : settings.branches.get(event.maCn());
        if (branchEmail != null) recipients.add(branchEmail);
        String body = "Hệ thống phân phối ghi nhận đăng nhập cần kiểm tra.\n\n"
                + "Loại: " + event.loai() + "\nThời điểm (giờ server): " + event.thoiGian()
                + "\nNguồn: " + event.nguon() + "\nChi nhánh: " + (event.maCn() == null ? "Quản trị" : event.maCn())
                + "\nIP ghi nhận: " + event.ip() + "\nChi tiết: " + event.chiTiet()
                + "\nXử lý của hệ thống: " + event.hanhDong()
                + "\n\nMở trang Giám sát an ninh để kiểm tra. Đổi Wi-Fi, VPN hoặc NAT cũng có thể làm IP thay đổi; cảnh báo không khẳng định tài khoản đã bị xâm nhập.\n";
        for (String recipient : recipients) {
            // Giới hạn theo loại + người nhận, không theo IP do kẻ tấn công có thể thay IP liên tục.
            enqueue("alert:" + event.loai() + ":" + recipient, settings.cooldownMs,
                    new EmailMessage(recipient, "[TOBOKI] Cảnh báo đăng nhập: " + event.loai(), body));
        }
    }

    /** Chỉ gọi một lần sau commit tạo NOTICE; không gọi khi resync hoặc khi chi nhánh trả lời. */
    public int noticeCreated(long id, String type, String title, String body, List<String> branches) {
        int count = 0;
        for (String branch : new LinkedHashSet<>(branches)) {
            String recipient = settings.branches.get(branch);
            if (!enabled() || recipient == null) {
                skipped.incrementAndGet();
                continue;
            }
            String text = "Thông báo từ công ty TOBOKI\n\nMã thông báo: " + id + "\nChi nhánh: " + branch
                    + "\nLoại: " + type + "\nTiêu đề: " + title + "\n\n" + body
                    + "\n\nMở trang chi nhánh để xem chi tiết và phản hồi. Email là kênh nhắc bổ sung; trạng thái chính thức nằm trong ứng dụng.\n";
            if (enqueue("notice:" + id + ":" + branch, TimeUnit.HOURS.toMillis(24),
                    new EmailMessage(recipient, "[TOBOKI] Thông báo #" + id + ": " + title, text))) count++;
        }
        return count;
    }

    private synchronized boolean enqueue(String key, long dedupeMs, EmailMessage message) {
        long now = clock.getAsLong();
        Long until = acceptedUntil.get(key);
        if (until != null && until > now) {
            skipped.incrementAndGet();
            return false;
        }
        try {
            worker.execute(() -> deliver(message));
        } catch (RejectedExecutionException e) {
            rejected.incrementAndGet();
            return false;
        }
        acceptedUntil.put(key, now + dedupeMs);
        while (acceptedUntil.size() > MAX_DEDUPE) acceptedUntil.remove(acceptedUntil.keySet().iterator().next());
        queued.incrementAndGet();
        return true;
    }

    private void deliver(EmailMessage message) {
        for (int attempt = 1; attempt <= settings.attempts; attempt++) {
            try {
                sender.send(message);
                sent.incrementAndGet();
                return;
            } catch (Exception e) {
                if (e instanceof InterruptedException || Thread.currentThread().isInterrupted()) {
                    Thread.currentThread().interrupt();
                    failed.incrementAndGet();
                    return;
                }
                if (attempt == settings.attempts) {
                    failed.incrementAndGet();
                    // Không log mật khẩu, nội dung email hoặc phản hồi SMTP có thể chứa thông tin tài khoản.
                    System.err.println("[mail] Gui SMTP that bai sau " + attempt + " lan (" + e.getClass().getSimpleName() + ")");
                    return;
                }
                try {
                    Thread.sleep(250L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    failed.incrementAndGet();
                    return;
                }
            }
        }
    }

    /** Trạng thái an toàn cho API admin: không chứa địa chỉ hoặc thông tin SMTP. */
    public Map<String, Object> status() {
        return Map.of("enabled", enabled(), "queued", queued.get(), "sent", sent.get(), "failed", failed.get(),
                "skipped", skipped.get(), "rejected", rejected.get(), "pending", worker == null ? 0 : worker.getQueue().size());
    }

    @Override
    public void close() {
        if (worker == null) return;
        worker.shutdown();
        try {
            if (!worker.awaitTermination(5, TimeUnit.SECONDS)) rejected.addAndGet(worker.shutdownNow().size());
        } catch (InterruptedException e) {
            rejected.addAndGet(worker.shutdownNow().size());
            Thread.currentThread().interrupt();
        }
    }
}
