import type { BranchItem } from "./types";

export type CartLine = { maHang: string; soLuong: number };
export type InvoiceLine = CartLine & { tenHang: string; model: string | null; donVi: string; giaBanLe: number; thanhTien: number };
export type Invoice = {
  id: string; maCn: string; tenCn: string; customer: string; status: "PENDING" | "PAID";
  createdAt: string; paidAt?: string; total: number; quantity: number; items: InvoiceLine[];
  // Older saved invoices have only total; keep their original amount without adding tax.
  subtotal?: number; vatRate?: number; vatAmount?: number;
};

const MAX_TOTAL = 9_000_000_000_000_000;

export function checkoutTotals(subtotal: number) {
  // Round once per order, half up to a whole VND, matching CheckoutService.
  const vatAmount = Math.floor(subtotal / 10) + (subtotal % 10 >= 5 ? 1 : 0);
  return { subtotal, vatRate: 10, vatAmount, total: subtotal + vatAmount };
}

// Replace this URL with your bank QR image when the receiving account is ready.
// Supported placeholders: {amount}, {reference}. The default QR contains a demo message.
export const PAYMENT_QR_URL = "";

export function paymentQr(order: Invoice) {
  return PAYMENT_QR_URL.replaceAll("{amount}", String(order.total)).replaceAll("{reference}", encodeURIComponent(order.id));
}

export function cartIssue(cart: CartLine[], items: BranchItem[]): string {
  if (!cart.length) return "Giỏ hàng đang trống.";
  let subtotal = 0;
  for (const line of cart) {
    const item = items.find((i) => i.maHang === line.maHang);
    if (!item) return `Mặt hàng ${line.maHang} không còn trong danh mục.`;
    if (!Number.isSafeInteger(line.soLuong) || line.soLuong < 1) return `Số lượng ${item.tenHang} phải là số nguyên dương.`;
    if (line.soLuong > item.soLuong) return `${item.tenHang} chỉ còn ${item.soLuong} sản phẩm.`;
    if (item.giaBanLe == null) return `Chưa có giá bán cho ${item.tenHang}.`;
    if (!Number.isSafeInteger(item.giaBanLe) || item.giaBanLe < 0) return `Giá bán ${item.tenHang} không hợp lệ.`;
    subtotal += item.giaBanLe * line.soLuong;
    if (!Number.isSafeInteger(subtotal) || subtotal > MAX_TOTAL) return "Tổng tiền vượt giới hạn.";
  }
  if (checkoutTotals(subtotal).total > MAX_TOTAL) return "Tổng tiền gồm VAT vượt giới hạn.";
  return "";
}

export function invoiceDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}
