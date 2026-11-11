package phanphoi.server.service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import phanphoi.common.ErrorCode;
import phanphoi.common.web.Http;
import phanphoi.server.Events;
import phanphoi.server.ServiceException;
import phanphoi.server.db.Db;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;

/** Server-authoritative quotes and atomic, idempotent manual payment confirmation. */
public final class CheckoutService {
    private static final long MAX_TOTAL = 9_000_000_000_000_000L;
    private final Db db;
    private final Events events;

    public CheckoutService(Db db, Events events) { this.db = db; this.events = events; }

    public Object execute(String branch, String action, JsonObject body) throws SQLException {
        return switch (action) {
            case "CREATE" -> create(branch, body);
            case "CONFIRM" -> confirm(branch, id(body));
            case "GET" -> db.read(c -> load(c, branch, id(body), false));
            case "LIST" -> db.read(c -> Db.list(c, """
                    SELECT noi_dung::text FROM hoa_don_ban WHERE ma_cn=? AND trang_thai='PAID'
                    ORDER BY thanh_toan_luc DESC LIMIT 100""",
                    r -> {
                        JsonObject order = Http.GSON.fromJson(r.getString(1), JsonObject.class);
                        order.remove("items");
                        return order;
                    }, branch));
            default -> throw bad("Thao tác thanh toán không hợp lệ");
        };
    }

    private static String id(JsonObject body) {
        String id = Http.str(body, "id");
        if (!id.matches("HD[A-Fa-f0-9]{32}")) throw bad("Mã đơn hàng không hợp lệ");
        return id;
    }

    static Map<String, Integer> quantities(JsonObject body) {
        if (!body.has("items") || !body.get("items").isJsonArray()) throw bad("Giỏ hàng không hợp lệ");
        JsonArray items = body.getAsJsonArray("items");
        if (items.isEmpty() || items.size() > 100) throw bad("Giỏ hàng cần có từ 1 đến 100 mặt hàng");
        Map<String, Integer> quantities = new TreeMap<>();
        try {
            for (var element : items) {
                JsonObject row = element.getAsJsonObject();
                String code = Http.str(row, "maHang");
                int qty = Http.integer(row, "soLuong");
                if (!code.matches("[A-Za-z0-9_-]{1,10}") || qty < 1 || qty > 1_000_000
                        || quantities.putIfAbsent(code, qty) != null) throw bad("Mặt hàng hoặc số lượng không hợp lệ");
            }
        } catch (IllegalStateException | ClassCastException | Http.ApiException e) {
            throw bad("Số lượng phải là số nguyên dương, mỗi mặt hàng chỉ xuất hiện một lần");
        }
        return quantities;
    }

    record Totals(long subtotal, int vatRate, long vatAmount, long total) { }

    static Totals totals(long subtotal) {
        if (subtotal < 0 || subtotal > MAX_TOTAL) throw bad("Tổng tiền vượt giới hạn");
        // Round 10% VAT once on the basket, half up to a whole VND, without floating point.
        long vat = (subtotal + 5) / 10;
        if (vat > MAX_TOTAL - subtotal) throw bad("Tổng tiền gồm VAT vượt giới hạn");
        return new Totals(subtotal, 10, vat, subtotal + vat);
    }

    private JsonObject create(String branch, JsonObject body) throws SQLException {
        String id = id(body);
        Map<String, Integer> quantities = quantities(body);
        String customer = Http.str(body, "customer");
        if (customer.length() > 120) throw bad("Tên khách hàng tối đa 120 ký tự");
        return db.tx(c -> {
            // Serialize retries using the same order ID, including simultaneous first requests.
            Db.one(c, "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", r -> 1, id);
            JsonObject previous = find(c, branch, id, false);
            if (previous != null) {
                if (!quantities.equals(quantities(previous)) || !customer.equals(Http.str(previous, "customer")))
                    throw bad("Mã đơn đã được sử dụng cho một giỏ hàng khác");
                return previous;
            }
            JsonArray lines = new JsonArray();
            long total = 0;
            int count = 0;
            for (var entry : quantities.entrySet()) {
                JsonObject line = Db.one(c, """
                        SELECT sp.ten, sp.model, sp.don_vi, sp.gia_ban_le, COALESCE(k.so_luong,0) AS ton
                        FROM san_pham sp LEFT JOIN kho_chi_nhanh k ON k.ma_sp=sp.ma_sp AND k.ma_cn=?
                        WHERE sp.ma_sp=?""", r -> {
                    if (r.getInt("ton") < entry.getValue()) throw bad("Không đủ tồn kho: " + entry.getKey());
                    JsonObject item = new JsonObject();
                    item.addProperty("maHang", entry.getKey());
                    item.addProperty("tenHang", r.getString("ten"));
                    item.addProperty("model", r.getString("model"));
                    item.addProperty("donVi", r.getString("don_vi"));
                    item.addProperty("giaBanLe", r.getLong("gia_ban_le"));
                    item.addProperty("soLuong", entry.getValue());
                    return item;
                }, branch, entry.getKey());
                if (line == null) throw bad("Không tìm thấy mặt hàng " + entry.getKey());
                long price = line.get("giaBanLe").getAsLong();
                if (price < 0 || price > 1_000_000_000_000L) throw bad("Giá bán không hợp lệ");
                long subtotal = price * entry.getValue();
                if (subtotal > MAX_TOTAL - total) throw bad("Tổng tiền vượt giới hạn");
                line.addProperty("thanhTien", subtotal);
                total += subtotal;
                count += entry.getValue();
                lines.add(line);
            }
            JsonObject order = new JsonObject();
            order.addProperty("id", id);
            order.addProperty("maCn", branch);
            String branchName = Db.one(c, "SELECT ten FROM chi_nhanh WHERE ma_cn=?", r -> r.getString(1), branch);
            order.addProperty("tenCn", branchName);
            order.addProperty("customer", customer);
            order.addProperty("status", "PENDING");
            order.addProperty("createdAt", Instant.now().toString());
            Totals amounts = totals(total);
            order.addProperty("subtotal", amounts.subtotal());
            order.addProperty("vatRate", amounts.vatRate());
            order.addProperty("vatAmount", amounts.vatAmount());
            order.addProperty("total", amounts.total());
            order.addProperty("quantity", count);
            order.add("items", lines);
            Db.update(c, "INSERT INTO hoa_don_ban (id,ma_cn,trang_thai,noi_dung) VALUES (?,?,'PENDING',?::jsonb)",
                    id, branch, order.toString());
            return order;
        });
    }

    private JsonObject confirm(String branch, String id) throws SQLException {
        JsonObject paid = db.tx(c -> {
            JsonObject order = load(c, branch, id, true);
            if ("PAID".equals(Http.str(order, "status"))) return order;
            Map<String, Long> prices = quotedPrices(order);
            // Sorted product locks avoid deadlocks between overlapping baskets.
            for (var entry : quantities(order).entrySet()) {
                Integer left = Db.one(c, """
                        UPDATE kho_chi_nhanh SET so_luong=so_luong-?
                        WHERE ma_cn=? AND ma_sp=? AND so_luong>=? RETURNING so_luong""",
                        r -> r.getInt(1), entry.getValue(), branch, entry.getKey(), entry.getValue());
                if (left == null) throw bad("Không đủ tồn kho: " + entry.getKey() + ". Vui lòng sửa giỏ hàng.");
                // Sell-out revenue uses the quoted pre-VAT retail price, not the current catalogue price.
                Db.update(c, "INSERT INTO ban_hang (ma_cn,ma_sp,so_luong,don_gia) VALUES (?,?,?,?)",
                        branch, entry.getKey(), entry.getValue(), prices.get(entry.getKey()));
            }
            order.addProperty("status", "PAID");
            order.addProperty("paidAt", Instant.now().toString());
            order.addProperty("paymentMethod", "QR_MANUAL");
            Db.update(c, "UPDATE hoa_don_ban SET trang_thai='PAID',noi_dung=?::jsonb,thanh_toan_luc=CURRENT_TIMESTAMP WHERE id=?",
                    order.toString(), id);
            return order;
        });
        events.publish(Events.STOCK, Map.of("maCn", branch));
        return paid;
    }

    /** giaBanLe của từng dòng trong đơn đã báo giá; thiếu hoặc hỏng thì null (dòng ban_hang ước tính theo giá hiện tại). */
    static Map<String, Long> quotedPrices(JsonObject order) {
        Map<String, Long> prices = new TreeMap<>();
        if (!order.has("items") || !order.get("items").isJsonArray()) return prices;
        for (var element : order.getAsJsonArray("items")) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            try {
                long price = row.get("giaBanLe").getAsLong();
                if (price >= 0) prices.put(Http.str(row, "maHang"), price);
            } catch (RuntimeException ignored) {
                // đơn cũ không có giá: để null
            }
        }
        return prices;
    }

    private static JsonObject find(Connection c, String branch, String id, boolean lock) throws SQLException {
        return Db.one(c, "SELECT noi_dung::text FROM hoa_don_ban WHERE ma_cn=? AND id=?" + (lock ? " FOR UPDATE" : ""),
                r -> Http.GSON.fromJson(r.getString(1), JsonObject.class), branch, id);
    }

    private static JsonObject load(Connection c, String branch, String id, boolean lock) throws SQLException {
        JsonObject order = find(c, branch, id, lock);
        if (order == null) throw new ServiceException(ErrorCode.E04, "Không tìm thấy đơn hàng của chi nhánh");
        return order;
    }

    private static ServiceException bad(String message) { return new ServiceException(ErrorCode.E05, message); }
}
