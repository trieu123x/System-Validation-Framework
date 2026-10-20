import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phân phối hàng hóa",
  description: "Hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
