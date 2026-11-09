import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./industry.css";
import "./trade.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "TOBOKI",
  description: "TOBOKI - quản lý chi nhánh, hàng hóa và thông báo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
