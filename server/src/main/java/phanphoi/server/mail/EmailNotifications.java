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
    @FunctionalInterface public interface Audit { void record(String eventKey, String recipient, String status, int attempts); }
    private volatile Audit audit = (eventKey, recipient, status, attempts) -> {};
    public void audit(Audit audit) { this.audit = audit; }
    private final Map<String, java.util.ArrayDeque<Long>> recipientHours = new LinkedHashMap<>();
    private volatile Map<String, String> dbBranchRecipients;
    private volatile List<String> dbAdminRecipients;
    private java.util.concurrent.ScheduledExecutorService refresh;

    /** DB is source of truth for recipient addresses; refresh without blocking TCP/HTTP traffic. */
    public synchronized void useDatabaseRecipients(phanphoi.server.db.Db db) throws java.sql.SQLException {
        refreshRecipients(db); // fail fast if migration was not applied
        refresh = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread th = new Thread(r, "mail-recipient-refresh"); th.setDaemon(true); return th;
        });
        refresh.scheduleWithFixedDelay(() -> {
            try { refreshRecipients(db); }
            catch (Exception e) { System.err.println("[mail] DB recipients refresh failed: " + e.getMessage()); }
        }, 30, 30, TimeUnit.SECONDS);
    }

    private void refreshRecipients(phanphoi.server.db.Db db) throws java.sql.SQLException {
        Map<String, String> branches = new LinkedHashMap<>();
        List<String> admins = new java.util.ArrayList<>();
        db.read(c -> {
            for (String[] r : phanphoi.server.db.Db.list(c,
                    "SELECT ma_cn,email FROM chi_nhanh WHERE NOT gia_lap AND email IS NOT NULL",
                    rs -> new String[]{rs.getString(1), rs.getString(2)})) {
                try { branches.put(r[0], MailSettings.mailbox(r[1])); }
                catch (IllegalArgumentException ignored) { System.err.println("[mail] Bad email for " + r[0]); }
            }
            for (String s : phanphoi.server.db.Db.list(c,
                    "SELECT email FROM mail_admin_config WHERE singleton = TRUE", rs -> rs.getString(1))) {
                try { admins.add(MailSettings.mailbox(s)); }
                catch (IllegalArgumentException ignored) { System.err.println("[mail] Bad admin email"); }
            }
            return null;
        });
        dbBranchRecipients = Map.copyOf(branches);
        dbAdminRecipients = List.copyOf(admins);
    }

    private List<String> admins() { return dbAdminRecipients != null ? dbAdminRecipients : settings.admins; }
    private String branchRecipient(String code) {
        return (dbBranchRecipients != null ? dbBranchRecipients : settings.branches).get(code);
    }

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
        if (!enabled()) return;
        if (event.loai().equals("SCRAPING") || event.loai().equals("CLIENT_SCRAPING")) {
            scrapingAlert(event);
            return;
        }
        if (!LOGIN_ALERTS.contains(event.loai())) return;
        Set<String> recipients = new LinkedHashSet<>(admins());
        String branchEmail = event.maCn() == null ? null : branchRecipient(event.maCn());
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

    private void scrapingAlert(SecurityEvent e) {
        if (!settings.scrapingEnabled) return;
        boolean clientReport = e.loai().equals("CLIENT_SCRAPING");
        if (!clientReport && !e.muc().equals("HIGH") && !e.hanhDong().equals("GIOI_HAN") && !e.hanhDong().equals("KHOA_TK")) return;
        Set<String> recipients = new LinkedHashSet<>(admins());
        String branchEmail = e.maCn() == null ? null : branchRecipient(e.maCn());
        if (branchEmail != null) recipients.add(branchEmail);
        String subject = "[TOBOKI SECURITY] Truy xuất bất thường - " + (e.maCn() == null ? "Admin" : e.maCn());
        // Never include client-supplied detail in email. Only server-normalized values or trusted metadata.
        String body = "Phát hiện hoạt động truy xuất dữ liệu cần kiểm tra.\n\nMã sự kiện: " + e.eventKey()
                + "\nThời điểm (giờ server): " + e.thoiGian()
                + "\nChi nhánh: " + (e.maCn() == null ? "Quản trị" : e.maCn())
                + "\nNguồn: " + (clientReport ? "HTTP chi nhánh (client tự báo cáo; chưa xác minh độc lập)" : e.metadata().getOrDefault("channel", e.nguon()))
                + "\nTài nguyên: " + e.metadata().getOrDefault("resource", "Xem dashboard")
                + "\nSố yêu cầu/cửa sổ: " + e.metadata().getOrDefault("requestCount", "N/A") + "/" + e.metadata().getOrDefault("windowSeconds", "N/A") + " giây"
                + "\nĐiểm rủi ro: " + e.metadata().getOrDefault("riskScore", "N/A")
                + "\nXử lý: " + (clientReport ? "Client báo giới hạn truy cập; kiểm tra tại chi nhánh" : e.metadata().getOrDefault("action", e.hanhDong()))
                + "\nThời gian thử lại: " + e.metadata().getOrDefault("retryAfter", "N/A") + " giây"
                + "\n\nNếu thao tác hợp lệ, liên hệ quản trị viên để xem xét. Nếu không nhận ra hoạt động này, kiểm tra phiên đăng nhập và đổi mật khẩu. Cảnh báo không khẳng định dữ liệu đã bị lấy.\n";
        for (String recipient : recipients) {
            enqueue("scrape:" + e.loai() + ":" + e.maCn() + ":" + e.muc() + ":" + recipient,
                    settings.scrapingCooldownMs, new EmailMessage(recipient, subject, body), e.eventKey());
        }
    }

    /** Chỉ gọi một lần sau commit tạo NOTICE; không gọi khi resync hoặc khi chi nhánh trả lời. */
    public int noticeCreated(long id, String type, String title, String body, List<String> branches) {
        int count = 0;
        for (String branch : new LinkedHashSet<>(branches)) {
            String recipient = branchRecipient(branch);
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
        return enqueue(key, dedupeMs, message, null);
    }

    private synchronized boolean enqueue(String key, long dedupeMs, EmailMessage message, String eventKey) {
        long now = clock.getAsLong();
        Long until = acceptedUntil.get(key);
        if (until != null && until > now) {
            skipped.incrementAndGet();
            if (eventKey != null) audit.record(eventKey, message.to(), "SUPPRESSED", 0);
            return false;
        }
        java.util.ArrayDeque<Long> hour = recipientHours.computeIfAbsent(message.to(), k -> new java.util.ArrayDeque<>());
        while (!hour.isEmpty() && now-hour.peekFirst() >= 3600000) hour.removeFirst();
        if (eventKey != null && hour.size() >= settings.maxPerHour) {
            skipped.incrementAndGet(); audit.record(eventKey, message.to(), "SUPPRESSED", 0); return false;
        }
        try {
            // Queue audit precedes worker completion in the ordered audit queue.
            if (eventKey != null) audit.record(eventKey, message.to(), "QUEUED", 0);
            worker.execute(() -> deliver(message, eventKey));
        } catch (RejectedExecutionException e) {
            rejected.incrementAndGet();
            if (eventKey != null) audit.record(eventKey, message.to(), "REJECTED", 0);
            return false;
        }
        if (eventKey != null) hour.addLast(now);
        acceptedUntil.values().removeIf(t -> t <= now);
        acceptedUntil.put(key, now + dedupeMs);
        while (acceptedUntil.size() > MAX_DEDUPE) acceptedUntil.remove(acceptedUntil.keySet().iterator().next());
        queued.incrementAndGet();
        return true;
    }

    private void deliver(EmailMessage message, String eventKey) {
        for (int attempt = 1; attempt <= settings.attempts; attempt++) {
            try {
                sender.send(message);
                sent.incrementAndGet();
                if (eventKey != null) audit.record(eventKey, message.to(), "SENT", attempt);
                return;
            } catch (Exception e) {
                if (e instanceof InterruptedException || Thread.currentThread().isInterrupted()) {
                    Thread.currentThread().interrupt();
                    failed.incrementAndGet();
                    if (eventKey != null) audit.record(eventKey, message.to(), "FAILED", attempt);
                    return;
                }
                if (attempt == settings.attempts || permanent(e)) {
                    failed.incrementAndGet();
                    if (eventKey != null) audit.record(eventKey, message.to(), "FAILED", attempt);
                    // Không log mật khẩu, nội dung email hoặc phản hồi SMTP có thể chứa thông tin tài khoản.
                    System.err.println("[mail] Gui SMTP that bai sau " + attempt + " lan (" + e.getClass().getSimpleName() + ")");
                    return;
                }
                try {
                    Thread.sleep(250L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    failed.incrementAndGet();
                    if (eventKey != null) audit.record(eventKey, message.to(), "FAILED", attempt);
                    return;
                }
            }
        }
    }

    private static boolean permanent(Exception e) {
        if (e instanceof jakarta.mail.AuthenticationFailedException || e instanceof jakarta.mail.internet.AddressException) return true;
        if (e instanceof org.eclipse.angus.mail.smtp.SMTPAddressFailedException smtp) return smtp.getReturnCode() >= 500;
        if (e instanceof org.eclipse.angus.mail.smtp.SMTPSendFailedException smtp) return smtp.getReturnCode() >= 500;
        return false;
    }

    /** Trạng thái an toàn cho API admin: không chứa địa chỉ hoặc thông tin SMTP. */
    public Map<String, Object> status() {
        return Map.of("enabled", enabled(), "queued", queued.get(), "sent", sent.get(), "failed", failed.get(),
                "skipped", skipped.get(), "rejected", rejected.get(), "pending", worker == null ? 0 : worker.getQueue().size());
    }

    @Override
    public void close() {
        if (refresh != null) refresh.shutdownNow();
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
