// Chương 13. Kết luận (N1)
module.exports = (L) => {
  const { add, P, H1 } = L;

  add(H1("13. Kết luận", "13"));
  add(P("Project giải quyết bài toán phân phối hàng hóa giữa một kho tổng và nhiều chi nhánh, trong đó chi nhánh tự báo thiếu hàng và công ty cấp bổ sung theo thời gian thực, bằng một hệ thống Client/Server trên Socket TCP. Phần cốt lõi là giao tiếp mạng: một giao thức tầng ứng dụng 33 lệnh do nhóm thiết kế, chạy trên một kết nối bền vững cho mỗi chi nhánh, dùng chung cho request và tin đẩy; khám phá server bằng UDP broadcast; heartbeat ở tầng ứng dụng; và hai mô hình I/O (BIO, NIO) chọn được bằng cấu hình."));
  add(P("Từ phân tích lý thuyết về TCP, mô hình I/O, độ tin cậy và đồng thời, nhóm nhận diện năm tình huống mà cách làm thông thường thất bại: tranh chấp kho tổng, mất tin khi mất kết nối, client chậm, kết nối lại hàng loạt, và lưu lượng tấn công. Với mỗi tình huống, nhóm đề xuất một giải pháp, giữ baseline bằng cờ cấu hình, và đo bằng số liệu thật với tới 1000 chi nhánh ảo. Kết quả:"));
  add(L.B("Không còn bán vượt kho, nhanh hơn cách khóa Java 3,5 lần."));
  add(L.B("Không còn mất tin OFFER (35,5 % và 20,1 % → 0 %)."));
  add(L.B("Một chi nhánh treo không còn chặn người khác (540 → 6000/6000 tin)."));
  add(L.B("Server giữ khoảng 33 luồng ở 1000 chi nhánh, so với 2017 luồng của mô hình mỗi kết nối một luồng. Tầng TCP trả lời gần 10 000 tin/giây với p95 1,49 ms."));
  add(L.B("Đỉnh tải khi nối lại giảm 18 lần mà vẫn giữ giới hạn 5 giây."));
  add(L.B("Cả 5 kẻ tấn công mô phỏng bị chặn mà không chặn nhầm chi nhánh nào."));
  add(L.B("Broadcast tới 1000 chi nhánh không mất tin nào."));
  add(P("Hệ thống đạt toàn bộ ca kiểm thử tích hợp và 129 unit test. Bài học lớn nhất là trong lập trình mạng, tính đúng đắn phải được đặt ở nơi không bị ảnh hưởng bởi lỗi mạng: một câu lệnh SQL nguyên tử, một trạng thái bền vững trong CSDL, một hàng đợi có giới hạn. Kết nối TCP chỉ là kênh truyền có thể đứt bất cứ lúc nào. Toàn bộ thực nghiệm có thể chạy lại bằng một lệnh, nên mọi con số trong báo cáo đều kiểm chứng lại được."));
};
