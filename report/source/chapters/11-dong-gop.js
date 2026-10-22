// Chương 11. Đóng góp và điểm mới (N2 tổng hợp, mỗi người viết dòng của mảng mình)
module.exports = (L) => {
  const { add, P, H1, H2, table } = L;

  add(H1("11. Đóng góp và điểm mới (Novelty and Contributions)", "11"));
  add(P("So với bản đặc tả ban đầu và cách làm thông thường của các hệ thống Client/Server cùng loại ({tab:related-baseline}), project khác ở các cơ chế dưới đây. Mỗi đóng góp có một cờ cấu hình để bật lại cách làm cũ, và có bằng chứng định lượng từ thực nghiệm hoặc kiểm thử."));
  add(table("Đóng góp, điểm khác so với baseline và bằng chứng", [
    ["#", "Đóng góp", "Khác gì so với baseline / cách làm thông thường", "Bằng chứng"],
    ["1", "Giao thức dòng văn bản 33 lệnh trên một kết nối TCP dùng chung cho request và push; đóng khung, escape hai tầng, giới hạn 4096 byte, số tham số cố định, kiểm tra chiều lệnh", "Thường dùng hai kết nối hoặc polling; không giới hạn dòng; một tin sai có thể làm hỏng phiên", "129 unit test; TC-09, TC-10; E7: 0 tin mất ở 199 058 tin"],
    ["2", "Trừ kho nguyên tử bằng `UPDATE … WHERE so_luong >= ?` kèm khóa dòng yêu cầu và thứ tự khóa cố định", "Đọc-rồi-ghi bị lost update; `synchronized` đúng nhưng tuần tự hóa mọi ACCEPT và sai khi có nhiều tiến trình", "E1: bán vượt 200 → 0; nhanh hơn `synchronized` 3,5 lần; E6: kho đúng ở 20 000 vòng; TC-05, TC-12"],
    ["3", "Giao tin theo trạng thái: hàng đợi offline + gửi lại mọi việc còn mở từ CSDL sau LOGIN_OK; client và server chịu được tin trùng", "SRS chỉ xếp hàng khi server biết chi nhánh offline; tin ghi vào socket “chết” bị mất", "E2: tỉ lệ mất 35,5 % → 20,1 % (SRS) → 0 %; TC-06"],
    ["4", "Hàng đợi gửi có giới hạn cho từng kết nối; cắt client đọc chậm thay vì để nó chặn người khác", "Ghi trực tiếp: một client treo làm treo broadcast tới mọi client", "E3: 540/6000 → 6000/6000 tin"],
    ["5", "Server NIO: một Selector, worker pool, hàng đợi tuần tự theo kết nối (giữ thứ tự tin), worker ghi thẳng khi kết nối rỗi", "Mỗi kết nối 1–2 luồng; hoặc NIO mà mọi lần ghi phải qua luồng Selector", "E4: 1017 → 32 luồng ở 500 CN; E7: 2017 → 33 luồng ở 1000 CN, p95 8,50 → 1,49 ms so với NIO qua Selector"],
    ["6", "Nối lại jitter lệch pha: lần đầu U[0, C], các lần sau U[C/2, C], vẫn giữ giới hạn ≤ 5 giây", "Nhịp cố định 5 s làm mọi client dồn cục; exponential backoff thử quá dày khi server tắt lâu", "E5: đỉnh 300 → 16,4 lần thử/100 ms; nối lại TB 3,2 s → 1,9 s"],
    ["7", "Giám sát an ninh off/detect/block theo IP và theo phiên, bộ đếm cửa sổ trượt không khóa, không chặn IP còn phiên hợp lệ; client phát hiện CSRF, DNS rebinding, server giả mạo", "Không giám sát; hoặc chặn theo IP làm chặn nhầm cả nhóm chi nhánh sau một NAT", "E8: 5/5 kẻ tấn công bị chặn, 0 chặn nhầm, tin tấn công −96,6 %; TC-15, TC-16"],
    ["8", "Bộ thực nghiệm tái lập được: mỗi cải tiến có cờ baseline, một lệnh khởi động server theo từng biến thể, giả lập tới 1000 chi nhánh nói đúng giao thức, xuất CSV và biểu đồ", "Đo tay, hoặc chỉ demo chức năng", "`scripts\\run-experiments.bat run=all`; `experiments/results/*.csv`; E7, E9 phát hiện hai điểm nghẽn mà kiểm thử chức năng không thấy"],
  ], [0.5, 3.8, 3.8, 3.9], [], "contrib"));
  add(H2("11.1. Tính mới so với cách làm thông thường"));
  add(P("Điểm mới của project không nằm ở việc dùng một thuật toán chưa ai biết. Nó nằm ở chỗ **mỗi cơ chế được đặt cạnh baseline của chính nó và đo trong cùng một hệ thống**. Đóng góp 3 là ví dụ rõ nhất. Cách làm phổ biến (và cũng là cách đặc tả ban đầu yêu cầu) là xếp hàng tin cho client offline. Thực nghiệm E2 chỉ ra cách đó vẫn mất 20 % tin trong trường hợp rút dây, vì nó dựa vào một giả định sai: rằng server biết khi nào client offline. Đồng bộ theo trạng thái loại bỏ giả định đó mà không phải thêm trường nào vào giao thức."));
  add(P("Đóng góp 5 và kết quả E9 cho thấy thêm một điều: cùng một tối ưu (worker ghi thẳng) có lợi cho mẫu giao tiếp một–một (E7, p95 nhanh 5,7 lần) nhưng không giúp gì cho mẫu một–nhiều (broadcast). Phát hiện này chỉ có được vì bộ thực nghiệm đo cả hai mẫu trên cùng một mã nguồn."));
  add(P("Ngoài ra, hệ thống có các tính năng mở rộng theo SRS 7.2: tự tìm server bằng UDP broadcast, điều chuyển hàng giữa chi nhánh với server làm trung gian giao dịch ba bên, thông báo có phản hồi, và công nợ hai chiều được đẩy tới chi nhánh theo thời gian thực."));
};
