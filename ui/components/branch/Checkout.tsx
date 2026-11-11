"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, fmtMoney } from "@/lib/api";
import type { BranchItem } from "@/lib/types";
import { cartIssue, checkoutTotals, invoiceDate, paymentQr, type CartLine, type Invoice } from "@/lib/checkout";
import { ProductImage } from "@/components/ui";
import "./checkout.css";

type Push = (level: string, text: string) => void;

function AmountBreakdown({ amounts }: { amounts: Pick<Invoice, "total" | "subtotal" | "vatRate" | "vatAmount"> }) {
  return <>
    <div className="checkout-summary-row"><span>Tiền hàng</span><b>{fmtMoney(amounts.subtotal ?? amounts.total)}</b></div>
    {amounts.vatRate != null && <div className="checkout-summary-row"><span>VAT {amounts.vatRate}%</span><b>{fmtMoney(amounts.vatAmount ?? 0)}</b></div>}
  </>;
}

export function CartIcon({ kind = "cart" }: { kind?: "cart" | "receipt" | "check" }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "cart" ? <><path d="M3 3h2l2.4 12h11l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></> : kind === "receipt" ? <><path d="M6 3l2 1 2-1 2 1 2-1 2 1 2-1v18l-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M9 8h6M9 12h6M9 16h3" /></> : <path d="m5 12 4 4L19 6" />}
  </svg>;
}

export function Checkout({ cart, setCart, items, online, push, branch, onShop, onBusyChange }: {
  cart: CartLine[]; setCart: (cart: CartLine[]) => void; items: BranchItem[]; online: boolean;
  push: Push; branch: string; onShop: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [order, setOrder] = useState<Invoice | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrFailed, setQrFailed] = useState(false);
  const [qrSrc, setQrSrc] = useState("");
  const guard = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const storageKey = `toboki-checkout:${branch}`;

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);

  useEffect(() => {
    if (!order || order.status === "PAID") return;
    let active = true;
    setQrSrc(""); setQrFailed(false);
    const configured = paymentQr(order);
    if (configured) { setQrSrc(configured); return; }
    QRCode.toDataURL(`TOBOKI DEMO | ${order.id} | ${order.total} VND | Khong dung de chuyen khoan`, {
      width: 480, margin: 2, color: { dark: "#194f72", light: "#ffffff" }, errorCorrectionLevel: "M",
    }).then((src) => { if (active) setQrSrc(src); }).catch(() => { if (active) setQrFailed(true); });
    return () => { active = false; };
  }, [order]);

  useEffect(() => {
    let active = true;
    setReady(false); setRecoveryFailed(false);
    const restore = async () => {
      try {
        const id = localStorage.getItem(storageKey);
        if (id && /^HD[0-9a-f]{32}$/.test(id)) {
          const existing = await api<Invoice>(`/api/invoices/${id}`);
          if (active) { setOrder(existing); if (existing.status === "PAID") setCart([]); }
        }
      } catch (e) {
        if (active) {
          if ((e as Error).message === "Không tìm thấy đơn hàng của chi nhánh") {
            // The server has verified that no order was created for this ID.
            localStorage.removeItem(storageKey);
          } else {
            setRecoveryFailed(true);
            setError(`Không thể kiểm tra kết quả của đơn trước: ${(e as Error).message}`);
          }
        }
      }
      finally { if (active) setReady(true); }
    };
    void restore();
    return () => { active = false; };
    // The component is scoped to one authenticated branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, retry]);

  const issue = cartIssue(cart, items);
  const amounts = checkoutTotals(cart.reduce((sum, line) => sum + (items.find((i) => i.maHang === line.maHang)?.giaBanLe ?? 0) * line.soLuong, 0));
  const quantity = cart.reduce((sum, line) => sum + line.soLuong, 0);
  const update = (code: string, qty: number) => {
    setError("");
    if (!Number.isSafeInteger(qty) || qty < 1) return;
    setCart(cart.map((line) => line.maHang === code ? { ...line, soLuong: qty } : line));
  };

  const create = async () => {
    if (guard.current || issue || !online) return;
    guard.current = true; setBusy(true); setError("");
    const signature = JSON.stringify({ cart, customer: customer.trim() });
    if (request.current?.signature !== signature) request.current = { signature, id: `HD${crypto.randomUUID().replaceAll("-", "")}` };
    try {
      // Persist the ID before sending: a lost response can be recovered without making a second order.
      localStorage.setItem(storageKey, request.current.id);
      const created = await api<Invoice>("/api/checkout", { id: request.current.id, items: cart, customer: customer.trim() });
      setOrder(created); setQrFailed(false);
      if (created.status === "PAID") setCart([]);
    } catch (e) { setError((e as Error).message); }
    finally { guard.current = false; setBusy(false); }
  };

  const confirmPayment = async () => {
    if (!order || guard.current || !online) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const paid = await api<Invoice>(`/api/checkout/${order.id}/confirm`, {});
      setOrder(paid); setCart([]);
      push("success", "Đã xác nhận thanh toán và xuất hóa đơn.");
    } catch (e) { setError((e as Error).message); }
    finally { guard.current = false; setBusy(false); }
  };

  const reset = () => {
    if (busy) return;
    localStorage.removeItem(storageKey); setOrder(null); request.current = null; setError(""); setCustomer("");
  };

  if (!ready) return <div className="checkout-empty" role="status">Đang kiểm tra đơn hàng...</div>;
  if (recoveryFailed) return <div className="checkout-empty"><CartIcon kind="receipt" /><h3>Đơn hàng đang chờ kiểm tra</h3><p role="alert">{error}</p><p>Vui lòng tải lại đơn để kiểm tra thanh toán trước khi tiếp tục.</p><button className="btn btn-primary" disabled={!online} onClick={() => { setError(""); setRetry((value) => value + 1); }}>Thử tải lại đơn</button></div>;
  if (order?.status === "PAID") return <>
    <div className="checkout-success"><span className="checkout-success-icon"><CartIcon kind="check" /></span><div><h2>Thanh toán hoàn tất</h2><p>Hóa đơn đã được lưu. Cảm ơn bạn đã mua hàng tại TOBOKI.</p></div><button className="btn" onClick={() => { reset(); onShop(); }}>← Quay lại bán hàng</button></div>
    <InvoiceView invoice={order} />
  </>;

  return <fieldset className="checkout-lock" disabled={busy}><div className="checkout-page">
    {!order && cart.length > 0 && <button type="button" className="btn checkout-shop-back" onClick={onShop}>← Tiếp tục chọn hàng</button>}
    <div className="checkout-heading"><h2>{order ? "Thanh toán đơn hàng" : "Giỏ hàng của bạn"}</h2><span className="checkout-step">01 Giỏ hàng <b>→</b> 02 Thanh toán <b>→</b> 03 Hóa đơn</span></div>
    {error && <div className="banner banner-danger" role="alert">{error}</div>}
    {!online && <div className="banner banner-warn">Đang mất kết nối. Giỏ hàng được giữ lại; thanh toán sẽ mở khi kết nối trở lại.</div>}
    {order ? <div className="checkout-grid payment-grid">
      <section className="checkout-panel payment-panel">
        <h3>Mã QR</h3>
        <div className="payment-qr">{qrFailed ? <p role="alert">Không tải được QR. Vui lòng kiểm tra lại ảnh mã thanh toán.</p> : qrSrc ? <img src={qrSrc} width={240} height={240} alt="Mã QR thanh toán đơn hàng" onError={() => setQrFailed(true)} /> : <span role="status">Đang tạo mã QR...</span>}</div>
        <div className="payment-amount">{fmtMoney(order.total)}</div><p className="muted">Nội dung: <strong className="payment-reference">{order.id}</strong></p>
      </section>
      <aside className="checkout-panel checkout-summary"><span className="checkout-eyebrow">CHI TIẾT ĐƠN HÀNG</span><h3>{order.customer || "Khách lẻ"}</h3><p className="muted">{order.tenCn} · {invoiceDate(order.createdAt)}</p><div className="checkout-mini-lines">{order.items.map((line) => <div key={line.maHang}><span>{line.tenHang}<small>{line.soLuong} × {fmtMoney(line.giaBanLe)}</small></span><b>{fmtMoney(line.thanhTien)}</b></div>)}</div><AmountBreakdown amounts={order} /><div className="checkout-total"><span>Tổng thanh toán</span><strong>{fmtMoney(order.total)}</strong></div><button className="btn btn-primary checkout-main-btn" disabled={!online || busy} onClick={confirmPayment}><CartIcon kind="check" />{busy ? "Đang xác nhận..." : "Xác nhận thanh toán"}</button><button className="btn checkout-back" disabled={busy} onClick={reset}>← Quay lại sửa giỏ hàng</button></aside>
    </div> : !cart.length ? <div className="checkout-empty"><span className="checkout-empty-icon"><CartIcon /></span><h3>Giỏ hàng đang trống</h3><button className="btn btn-primary" onClick={onShop}>Chọn sản phẩm</button></div> : <div className="checkout-grid">
      <section className="checkout-panel"><div className="checkout-panel-head"><h3>Sản phẩm <span>{cart.length}</span></h3></div><div className="cart-lines">{cart.map((line) => {
        const item = items.find((i) => i.maHang === line.maHang);
        return <article className="cart-line" key={line.maHang}><ProductImage src={item?.anh} alt={item?.tenHang ?? line.maHang} size={58} /><div className="cart-product"><strong>{item?.tenHang ?? line.maHang}</strong><small>{line.maHang}{item?.model ? ` · ${item.model}` : ""}</small><span>{fmtMoney(item?.giaBanLe)}</span>{(!item || line.soLuong > item.soLuong) && <small className="error">{item ? `Chỉ còn ${item.soLuong} sản phẩm` : "Sản phẩm không còn khả dụng"}</small>}</div><div className="cart-quantity"><button aria-label={`Giảm ${line.maHang}`} disabled={line.soLuong <= 1} onClick={() => update(line.maHang, line.soLuong - 1)}>−</button><input type="number" min={1} max={item?.soLuong} aria-label={`Số lượng ${line.maHang}`} value={line.soLuong} onChange={(e) => update(line.maHang, Number(e.target.value))} /><button aria-label={`Tăng ${line.maHang}`} disabled={!item || line.soLuong >= item.soLuong} onClick={() => update(line.maHang, line.soLuong + 1)}>+</button></div><strong className="cart-subtotal">{fmtMoney((item?.giaBanLe ?? 0) * line.soLuong)}</strong><button className="cart-remove" aria-label={`Xóa ${line.maHang} khỏi giỏ`} onClick={() => setCart(cart.filter((i) => i.maHang !== line.maHang))}>×</button></article>;
      })}</div><div className="cart-bottom"><span>{quantity} sản phẩm trong giỏ</span><button className="btn btn-sm" onClick={() => setCart([])}>Xóa giỏ hàng</button></div></section>
      <aside className="checkout-panel checkout-summary"><span className="checkout-eyebrow">ĐƠN HÀNG CỦA BẠN</span><h3>Sẵn sàng thanh toán</h3><label className="field">Tên khách hàng <span className="muted">(không bắt buộc)</span><input value={customer} maxLength={120} placeholder="Khách lẻ" onChange={(e) => setCustomer(e.target.value)} /></label><div className="checkout-summary-row"><span>Số mặt hàng</span><b>{cart.length}</b></div><div className="checkout-summary-row"><span>Số lượng sản phẩm</span><b>{quantity}</b></div><AmountBreakdown amounts={amounts} /><div className="checkout-total"><span>Tổng thanh toán</span><strong>{fmtMoney(amounts.total)}</strong></div>{issue && <p className="error" role="alert">{issue}</p>}<button className="btn btn-primary checkout-main-btn" disabled={!!issue || busy || !online} onClick={create}>{busy ? "Đang tạo đơn..." : "Tiến hành thanh toán"}<span aria-hidden="true">→</span></button></aside>
    </div>}
  </div></fieldset>;
}

export function InvoiceView({ invoice }: { invoice: Invoice }) {
  return <div className="invoice-container"><div className="invoice-toolbar"><span><CartIcon kind="receipt" /> Hóa đơn bán hàng</span><button className="btn btn-primary" onClick={() => window.print()}>In / Lưu PDF</button></div><article className="invoice-paper">
    <header className="invoice-header"><div><div className="invoice-brand">TOBOKI<span>PROFESSIONAL EQUIPMENT</span></div><p>{invoice.tenCn}<br />Chi nhánh {invoice.maCn}</p></div><div className="invoice-heading"><h2>HÓA ĐƠN<br />BÁN HÀNG</h2><span className="invoice-paid"><CartIcon kind="check" /> ĐÃ THANH TOÁN</span></div></header>
    <div className="invoice-meta"><div><span>KHÁCH HÀNG</span><strong>{invoice.customer || "Khách lẻ"}</strong></div><div><span>MÃ HÓA ĐƠN</span><strong className="invoice-id">{invoice.id}</strong><small>Ngày thanh toán: {invoiceDate(invoice.paidAt ?? invoice.createdAt)}</small></div></div>
    <table className="invoice-table"><thead><tr><th>STT</th><th>SẢN PHẨM</th><th className="num">SL</th><th className="num">ĐƠN GIÁ</th><th className="num">THÀNH TIỀN</th></tr></thead><tbody>{invoice.items.map((line, index) => <tr key={line.maHang}><td>{String(index + 1).padStart(2, "0")}</td><td><strong>{line.tenHang}</strong><small>{line.maHang}{line.model ? ` / ${line.model}` : ""} · {line.donVi}</small></td><td className="num" data-label="Số lượng">{line.soLuong}</td><td className="num" data-label="Đơn giá">{fmtMoney(line.giaBanLe)}</td><td className="num" data-label="Thành tiền"><strong>{fmtMoney(line.thanhTien)}</strong></td></tr>)}</tbody></table>
    <div className="invoice-totals"><div className="invoice-payment"><span className="invoice-payment-icon"><CartIcon kind="check" /></span><div><strong>Thanh toán</strong><small>Đã xác nhận</small></div></div><div><div><span>Tổng số lượng</span><b>{invoice.quantity} sản phẩm</b></div><div><span>Tiền hàng</span><b>{fmtMoney(invoice.subtotal ?? invoice.total)}</b></div>{invoice.vatRate != null && <div><span>VAT {invoice.vatRate}%</span><b>{fmtMoney(invoice.vatAmount ?? 0)}</b></div>}<div className="invoice-grand-total"><span>TỔNG THANH TOÁN</span><strong>{fmtMoney(invoice.total)}</strong></div></div></div>
    <footer className="invoice-footer"><div><h3>Cảm ơn & hẹn gặp lại!</h3></div><div><b>TOBOKI</b><small>Hóa đơn bán hàng nội bộ</small></div></footer>
  </article></div>;
}

export function InvoiceHistory({ online, push, onBack }: { online: boolean; push: Push; onBack: () => void }) {
  const [rows, setRows] = useState<Omit<Invoice, "items">[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setBusy(true); setError("");
    try { setRows(await api("/api/invoices")); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (online) void load(); }, [online]);
  if (selected) return <><button className="btn invoice-return" onClick={() => setSelected(null)}>← Danh sách hóa đơn</button><InvoiceView invoice={selected} /></>;
  return <><button type="button" className="btn invoice-return" onClick={onBack}>← Quay lại</button><section className="checkout-panel"><div className="checkout-panel-head"><h3>Hóa đơn đã thanh toán <span>{rows.length}</span></h3><button className="btn" onClick={load} disabled={busy || !online}>Tải lại</button></div>{error && <p className="error" role="alert">{error}</p>}{!online && <p className="note">Kết nối lại để xem hóa đơn.</p>}{busy ? <p role="status">Đang tải hóa đơn...</p> : !rows.length ? <div className="checkout-empty"><CartIcon kind="receipt" /><h3>Chưa có hóa đơn</h3><p>Hóa đơn sẽ xuất hiện sau khi xác nhận thanh toán.</p></div> : <div className="table-wrap"><table><thead><tr><th>Mã hóa đơn</th><th>Khách hàng</th><th>Thanh toán lúc</th><th className="num">Tổng tiền</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="code">{row.id}</td><td>{row.customer || "Khách lẻ"}</td><td>{invoiceDate(row.paidAt ?? row.createdAt)}</td><td className="num">{fmtMoney(row.total)}</td><td><button className="btn btn-sm" disabled={busy || !online} onClick={async () => { setBusy(true); try { setSelected(await api(`/api/invoices/${row.id}`)); } catch (e) { push("error", (e as Error).message); } finally { setBusy(false); } }}>Xem hóa đơn</button></td></tr>)}</tbody></table></div>}</section></>;
}
