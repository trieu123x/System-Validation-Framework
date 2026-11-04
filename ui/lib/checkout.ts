import type { BranchItem } from "./types";

export type CartLine = { maHang: string; soLuong: number };
export type InvoiceLine = CartLine & { tenHang: string; model: string | null; donVi: string; giaBanLe: number; thanhTien: number };
export type Invoice = {
  id: string; maCn: string; tenCn: string; customer: string; status: "PENDING" | "PAID";
  createdAt: string; paidAt?: string; total: number; quantity: number; items: InvoiceLine[];
};

// Replace this URL with your bank QR image when the receiving account is ready.
// Supported placeholders: {amount}, {reference}. The default QR contains a demo message.
export const PAYMENT_QR_URL = "";
export const PAYMENT_QR_IS_DEMO = true;

export function paymentQr(order: Invoice) {
  return PAYMENT_QR_URL.replaceAll("{amount}", String(order.total)).replaceAll("{reference}", encodeURIComponent(order.id));
}

export function cartIssue(cart: CartLine[], items: BranchItem[]): string {
  if (!cart.length) return "Giỏ hàng đang trống.";
  for (const line of cart) {
    const item = items.find((i) => i.maHang === line.maHang);
    if (!item) return `Mặt hàng ${line.maHang} không còn trong danh mục.`;
    if (!Number.isSafeInteger(line.soLuong) || line.soLuong < 1) return `Số lượng ${item.tenHang} phải là số nguyên dương.`;
    if (line.soLuong > item.soLuong) return `${item.tenHang} chỉ còn ${item.soLuong} sản phẩm.`;
    if (item.giaBanLe == null) return `Chưa có giá bán cho ${item.tenHang}.`;
  }
  return "";
}

export function invoiceDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
