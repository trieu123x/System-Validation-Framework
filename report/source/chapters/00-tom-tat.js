// Tóm tắt, từ khóa, thuật ngữ viết tắt (N4)
const { Paragraph, TextRun } = require("docx");
const { FONT, BODY } = require("../lib");

module.exports = (L) => {
  const { add, P, H1, table } = L;

  add(H1("Tóm tắt"));
  add(P("Một doanh nghiệp phân phối gồm kho tổng và 10–20 chi nhánh cần biết ngay khi chi nhánh sắp hết hàng, cấp bổ sung đúng số lượng, và không bao giờ hứa xuất quá số hàng đang có. Làm thủ công qua điện thoại hay email thì báo chậm, dễ trùng yêu cầu, và kho tổng có thể bị xuất vượt khi nhiều chi nhánh cùng xin một mặt hàng. Báo cáo này trình bày một hệ thống Client/Server giải quyết bài toán đó, trong đó phần cốt lõi là giao tiếp mạng."));
  add(P("**Cách tiếp cận.** Mỗi chi nhánh giữ **một kết nối TCP bền vững** tới server công ty. Kết nối dùng chung cho request của chi nhánh và tin đẩy (push) của server, theo một giao thức tầng ứng dụng dạng dòng văn bản do nhóm tự thiết kế (33 lệnh, 6 mã lỗi). Chi nhánh tự tìm server trong mạng LAN bằng UDP broadcast. Server viết bằng Java 17, dùng **Java NIO**: một luồng Selector, worker pool và hàng đợi tuần tự theo từng kết nối. Giao diện web do chính các tiến trình Java phục vụ trên localhost, cập nhật realtime qua Server-Sent Events. Trình duyệt không bao giờ nói chuyện trực tiếp với server công ty."));
  add(P("**Giải pháp cho các tình huống khó.** Nhóm nhận diện năm tình huống mà cách làm thông thường thất bại và đề xuất giải pháp cho từng tình huống:"));
  [
    "trừ kho tổng nguyên tử bằng một câu `UPDATE … WHERE so_luong >= ?`;",
    "giao tin theo trạng thái: hàng đợi offline cộng bước gửi lại mọi yêu cầu còn mở từ CSDL sau khi đăng nhập;",
    "hàng đợi gửi có giới hạn cho từng kết nối để cô lập client đọc chậm;",
    "chính sách nối lại jitter lệch pha để tránh dồn cục;",
    "giám sát an ninh theo IP và theo phiên.",
  ].forEach((t) => add(L.B(t)));
  add(P("Mỗi cải tiến có cờ cấu hình để bật lại cách làm baseline. Chín thực nghiệm (E1–E9) chạy tự động với tới **1000 chi nhánh ảo** nói đúng giao thức TCP."));
  add(P("**Kết quả đo thực tế:**"));
  [
    "Hàng bán vượt kho giảm từ 200 đơn vị xuống 0, nhanh hơn cách khóa bằng `synchronized` 3,5 lần.",
    "Tỉ lệ mất tin OFFER khi chi nhánh rớt mạng giảm từ 35,5 % (không giữ tin) và 20,1 % (hàng đợi theo đặc tả) xuống 0 %.",
    "Một chi nhánh treo không còn chặn broadcast (6000/6000 tin so với 540/6000).",
    "Với 1000 chi nhánh, server NIO chỉ dùng 33 luồng, so với 2017 luồng của mô hình mỗi kết nối một luồng. Tầng TCP trả lời khoảng 9900 tin/giây với p95 1,49 ms.",
    "Đỉnh tải khi 300 chi nhánh cùng nối lại giảm từ 300 xuống 16,4 lần thử trong 100 ms.",
    "Chế độ chặn tấn công ngăn cả 5 kẻ tấn công mô phỏng mà không chặn nhầm chi nhánh thật nào.",
    "Broadcast tới 1000 chi nhánh tới đủ 100 % tin, tới chi nhánh cuối trong khoảng 40 ms.",
  ].forEach((t) => add(L.B(t)));
  add(new Paragraph({ spacing: { before: 160, after: 240 }, children: [new TextRun({ text: "Từ khóa: ", bold: true, font: FONT, size: BODY }),
    new TextRun({ text: "Socket TCP; giao thức tầng ứng dụng; Java NIO; giao tin tin cậy; kiểm soát tranh chấp; kết nối lại có jitter.", italics: true, font: FONT, size: BODY })] }));

  add(H1("Thuật ngữ và chữ viết tắt", "", { newPage: false }));
  add(table("Thuật ngữ và chữ viết tắt dùng trong báo cáo", [
    ["Viết tắt / thuật ngữ", "Nghĩa"],
    ["CN, YC, DC", "Chi nhánh; yêu cầu cấp hàng; điều chuyển hàng giữa hai chi nhánh"],
    ["TCP, UDP", "Transmission Control Protocol (hướng kết nối, tin cậy); User Datagram Protocol (không kết nối)"],
    ["BIO, NIO", "Blocking I/O (mỗi kết nối một luồng); Non-blocking I/O của Java (Selector)"],
    ["Push", "Tin server chủ động gửi xuống chi nhánh mà chi nhánh không hỏi (OFFER, DELIVERED, BROADCAST…)"],
    ["Đóng khung (framing)", "Cách xác định ranh giới từng thông điệp trong luồng byte của TCP"],
    ["Heartbeat", "Cặp tin PING/PONG ở tầng ứng dụng để phát hiện kết nối đã chết"],
    ["Kết nối nửa mở (half-open)", "Một bên đã mất (rút dây, mất điện) nhưng bên kia vẫn tưởng kết nối còn sống"],
    ["At-least-once, idempotent", "Giao ít nhất một lần (có thể trùng); thao tác làm lại nhiều lần vẫn cho cùng kết quả"],
    ["Lost update", "Hai giao dịch cùng đọc rồi ghi đè nhau làm mất một lần cập nhật"],
    ["Thundering herd", "Nhiều client cùng thử lại một lúc, tạo đỉnh tải dồn cục lên server"],
    ["Jitter", "Thời gian chờ ngẫu nhiên thêm vào để các client lệch pha nhau"],
    ["SSE", "Server-Sent Events: luồng sự kiện một chiều từ server HTTP tới trình duyệt"],
    ["CSRF, DNS rebinding", "Hai kiểu tấn công khiến trình duyệt của nạn nhân gọi API cục bộ thay kẻ tấn công"],
    ["p50, p95, p99", "Phân vị độ trễ: 50 %, 95 %, 99 % số mẫu nhỏ hơn hoặc bằng giá trị này"],
    ["Baseline", "Cách làm thông thường hoặc theo đặc tả ban đầu, giữ lại bằng cờ cấu hình để đo so sánh"],
    ["SRS, FR, NFR", "Bản đặc tả yêu cầu phần mềm của nhóm; yêu cầu chức năng; yêu cầu phi chức năng"],
  ], [3.2, 8.8]));
};
