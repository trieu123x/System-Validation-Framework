# Sơ đồ màn hình sau redesign

Route và xác thực giữ nguyên.

```mermaid
flowchart LR
  A[Đăng nhập admin /admin/] --> B[Tổng quan]
  B --> C[Hàng hóa & kho tổng]
  C --> C1[Sửa hàng hóa / nhập kho]
  B --> D[Kho chi nhánh]
  D --> D1[Chi tiết kho / bổ sung]
  B --> E[Đặt ngưỡng]
  B --> F[Công nợ CN / NCC]
  F --> F1[Sổ chi tiết / thu chi / hạn mức]
  B --> G[YC cấp hàng / điều chuyển / thông báo / giám sát / đối soát]
  H[Đăng nhập chi nhánh /branch/] --> I[Bán hàng: Thẻ hoặc Bảng]
  I --> J[Giỏ hàng]
  J --> K[Quote & QR thanh toán]
  K --> L[Xác nhận thủ công]
  L --> M[Hóa đơn / in PDF]
  K --> J
  J --> I
  H --> N[Hóa đơn đã lưu]
  N --> M
  H --> O[Ngưỡng / nhận hàng / điều chuyển / công nợ / thông báo / lịch sử / nhật ký / an ninh]
```

Sidebar desktop hoặc drawer chứa đúng chức năng theo role. Giỏ là action cạnh Tải lại tại bán hàng. Back đóng chi tiết hoặc form trước khi quay về module trước; bộ lọc tổng quan admin giữ ở parent như trước.
