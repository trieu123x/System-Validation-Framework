"use client";

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { STATE_LABEL, STATE_TONE, TRANSFER_LABEL } from "@/lib/api";
import { imageUrl } from "@/lib/images";

export function Badge({ tone = "muted", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StateBadge({ state, transfer }: { state: string | null | undefined; transfer?: boolean }) {
  if (!state) return null;
  const label = (transfer ? TRANSFER_LABEL : STATE_LABEL)[state] ?? state;
  return <Badge tone={STATE_TONE[state] ?? "muted"}>{label}</Badge>;
}

/** Ảnh tượng trưng của mặt hàng; chưa có ảnh hoặc tải lỗi (mất mạng) thì hiện chữ đầu của danh mục. */
export function ProductImage({ src, alt, category, size = 40, fit = "cover" }: {
  src: string | null | undefined; alt: string; category?: string; size?: number; fit?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src, size * 2, fit);
  const box = { width: size, height: size };
  if (!url || failed) {
    return <span className="thumb thumb-empty" style={box} title={category}>{(category || alt).charAt(0)}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- export tĩnh, ảnh đã thu nhỏ sẵn trên Cloudinary
  return <img className="thumb" style={box} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function Dot({ on }: { on: boolean }) {
  return <span className={`dot ${on ? "dot-on" : "dot-off"}`} aria-label={on ? "online" : "offline"} />;
}

export function Card({ title, actions, children, className }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

/** Ô chỉ số trong dải chỉ số đầu trang; có onClick thì bấm để mở danh sách tương ứng. */
export function Stat({ label, value, tone, hint, onClick }: {
  label: string; value: ReactNode; tone?: string; hint?: ReactNode; onClick?: () => void;
}) {
  const cls = `kpi ${tone ? "kpi-" + tone : ""} ${onClick ? "kpi-link" : ""}`;
  const body = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </>
  );
  return onClick ? <button type="button" className={cls} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
}

type NavItem<T extends string> = { id: T; label: string; count?: number; tone?: string; highlight?: boolean };
export type BackAction = { label: string; onClick: () => void };

/** Workspace nội bộ: sidebar desktop thu gọn; drawer cho tablet và điện thoại. */
export function Shell<T extends string>({ brand, sub, nav, value, onChange, status, title, actions, children, menu = false, navigationDisabled = false, back, menuLabel = "Chức năng chi nhánh", notificationId }: {
  brand: string; sub?: ReactNode; nav: NavItem<T>[]; value: T; onChange: (t: T) => void;
  status?: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode;
  menu?: boolean; navigationDisabled?: boolean; back?: BackAction; menuLabel?: string;
  notificationId?: T;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const sidebarId = `${drawerId}-sidebar`;
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const update = () => { setDesktop(media.matches); if (media.matches) drawer.current?.close(); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const notification = nav.find((item) => item.id === notificationId);
  const links = nav.filter((item) => item.id !== notificationId).map((n) => (
    <button type="button" key={n.id} className={n.id === value && n.highlight !== false ? "active" : ""} disabled={navigationDisabled} title={n.label}
      aria-label={n.count ? `${n.label} (${n.count})` : n.label}
      aria-current={n.id === value ? "page" : undefined} onClick={() => { onChange(n.id); drawer.current?.close(); }}>
      {menu && <NavigationIcon name={n.id} />}
      <span>{n.label}</span>
      {n.count ? <span className={`nav-count ${n.tone ? "count-" + n.tone : ""}`}>{n.count}</span> : null}
    </button>
  ));
  return (
    <div className={menu ? `workspace-shell${collapsed ? " sidebar-collapsed" : ""}` : undefined}>
      {menu && <aside className="app-sidebar" id={sidebarId} aria-hidden={!desktop}>
        <div className="sidebar-brand"><span className="brand-monogram">T</span><div><b>TOBOKI</b><small>QUẢN LÝ PHÂN PHỐI</small></div></div>
        <nav className="sidebar-nav" aria-label={menuLabel}>{links}</nav>
      </aside>}
      <div className={menu ? "app-workspace" : undefined}>
      <header className={`appbar${menu ? " appbar-compact" : ""}`}>
        {menu && <button type="button" className="menu-toggle" aria-label={desktop ? collapsed ? "Mở rộng menu" : "Thu gọn menu" : "Mở menu"}
          aria-expanded={desktop ? !collapsed : menuOpen} aria-controls={desktop ? sidebarId : drawerId}
          disabled={navigationDisabled} onClick={() => {
            if (desktop) setCollapsed((current) => !current);
            else { drawer.current?.showModal(); setMenuOpen(true); }
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>}
        <div className="appbar-brand">
          <b>{brand}</b>
          {sub && <span>{sub}</span>}
        </div>
        {!menu && <nav className="appbar-nav">{links}</nav>}
        {(status || notification) && <div className="appbar-status">
          {notification && <button type="button" className={`header-notification${value === notification.id ? " active" : ""}`}
            title="Thông báo" aria-label={notification.count ? `Thông báo (${notification.count} chưa đọc)` : "Thông báo"}
            aria-current={value === notification.id ? "page" : undefined} disabled={navigationDisabled} onClick={() => onChange(notification.id)}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2v1" /></svg>
            {!!notification.count && <span className="header-notification-count" aria-hidden="true">{notification.count > 99 ? "99+" : notification.count}</span>}
          </button>}
          {status}
        </div>}
      </header>
      {menu && <dialog className="app-drawer" id={drawerId} ref={drawer} aria-labelledby={`${drawerId}-title`}
        onClose={() => setMenuOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) drawer.current?.close(); }}>
        <div className="drawer-content">
          <div className="drawer-heading"><div><span>TOBOKI</span><h2 id={`${drawerId}-title`}>Menu chức năng</h2></div>
            <button type="button" className="drawer-close" aria-label="Đóng menu" onClick={() => drawer.current?.close()} autoFocus>×</button>
          </div>
          <div className="drawer-branch"><strong>{brand}</strong><small>{sub}</small></div>
          <nav className="drawer-nav" aria-label={menuLabel}>{links}</nav>
        </div>
      </dialog>}
      <div className="subbar">
        <div className="page-heading">
          <div className="page-title-row">{back && <button type="button" className="btn btn-back" disabled={navigationDisabled} onClick={back.onClick}>← {back.label}</button>}<h1>{title}</h1></div>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      <main className="page">{children}</main>
      </div>
    </div>
  );
}

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    stock: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7",
    cart: "M3 3h2l2 12h12l2-9H6M9 20h.01M18 20h.01",
    invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3",
    thresholds: "M4 6h6m4 0h6M4 12h10m4 0h2M4 18h2m4 0h10M10 3v6M14 9v6M6 15v6",
    offers: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    transfers: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
    debt: "M3 6h18v14H3ZM3 10h18M16 15h2M5 6V3h13v3",
    news: "m4 9 15-5v16L4 15ZM4 9H2v6h2M7 16l2 5h4l-2-4",
    history: "M3 11a9 9 0 1 1 3 8M3 5v6h6M12 7v5l3 2",
    activity: "M5 3h14v18H5ZM8 7h8M8 12h8M8 17h5",
    security: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
    overview: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
    products: "m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5",
    debts: "M3 6h18v14H3ZM3 10h18M16 15h2M5 6V3h13v3",
    broadcast: "m4 9 15-5v16L4 15ZM4 9H2v6h2M7 16l2 5h4l-2-4",
    monitor: "M3 4h18v13H3ZM8 21h8M12 17v4M6 11h3l2-4 3 7 2-3h2",
    reconcile: "M8 4H5v17h14V4h-3M8 3h8v4H8ZM8 12l2 2 5-5M8 18h8",
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.stock} /></svg>;
}

/** Mức tồn so với ngưỡng: đỏ dưới ngưỡng, vàng sắp chạm (< 1,5 × ngưỡng), xanh đủ, xám chưa đặt ngưỡng. */
export type StockLevel = "critical" | "warning" | "ok" | "unset";

export function stockLevel(soLuong: number, nguong: number): StockLevel {
  if (nguong <= 0) return "unset";
  if (soLuong < nguong) return "critical";
  if (soLuong < nguong * 1.5) return "warning";
  return "ok";
}

export const LEVEL_LABEL: Record<StockLevel, string> = {
  critical: "Dưới ngưỡng",
  warning: "Sắp chạm ngưỡng",
  ok: "Đủ hàng",
  unset: "Chưa đặt ngưỡng",
};

/** Thanh mức tồn: đầy thanh = 3 × ngưỡng, vạch đứng = ngưỡng. */
export function StockBar({ soLuong, nguong }: { soLuong: number; nguong: number }) {
  const level = stockLevel(soLuong, nguong);
  const full = nguong > 0 ? nguong * 3 : Math.max(soLuong, 1);
  const pct = Math.min(100, (soLuong / full) * 100);
  return (
    <div className={`stockbar level-${level}`} title={`${LEVEL_LABEL[level]}: tồn ${soLuong}, ngưỡng ${nguong}`}>
      <div className="stockbar-fill" style={{ width: `${pct}%` }} />
      {nguong > 0 && <div className="stockbar-mark" style={{ left: `${100 / 3}%` }} />}
    </div>
  );
}

/** Nhóm bộ lọc ở cột trái của trang danh sách. */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="filter-group">
      <div className="filter-title">{title}</div>
      {children}
    </div>
  );
}

/** Danh sách lựa chọn một (radio) kèm số dòng mỗi lựa chọn. */
export function Facet<T extends string>({ name, options, value, onChange }: {
  name: string; options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="facet" role="radiogroup">
      {options.map((o) => (
        <label key={o.id}>
          <input type="radio" name={name} checked={o.id === value} onChange={() => onChange(o.id)} />
          {o.label}
          {o.count != null && <span className="facet-count">{o.count}</span>}
        </label>
      ))}
    </div>
  );
}

/** Thanh lọc ngang đặt trên bảng: các ô `label.field` xếp một hàng, cuối hàng là nút Xoá lọc. */
export function FilterBar({ active, onClear, children }: { active: boolean; onClear: () => void; children: ReactNode }) {
  return (
    <div className="filterbar">
      {children}
      <button className="btn" disabled={!active} onClick={onClear}>Xoá lọc</button>
    </div>
  );
}

/** Cột đang sắp xếp; null = giữ thứ tự gốc. */
export type Sort<K extends string> = { key: K; dir: 1 | -1 } | null;

/** Tiêu đề cột bấm để sắp xếp: lần 1 tăng dần, lần 2 giảm dần, lần 3 bỏ sắp xếp. */
export function SortTh<K extends string>({ k, sort, onSort, num, children }: {
  k: K; sort: Sort<K>; onSort: (s: Sort<K>) => void; num?: boolean; children: ReactNode;
}) {
  const dir = sort?.key === k ? sort.dir : 0;
  return (
    <th scope="col" className={num ? "num" : undefined} aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}>
      <button type="button" className={`th-sort${dir ? " active" : ""}`}
        onClick={() => onSort(dir === 0 ? { key: k, dir: 1 } : dir === 1 ? { key: k, dir: -1 } : null)}>
        {children}<span className="sort-icon" aria-hidden>{dir === 1 ? "▲" : dir === -1 ? "▼" : "↕"}</span>
      </button>
    </th>
  );
}

/** Sắp xếp bản sao của rows theo sort; giá trị null/undefined luôn nằm cuối, chuỗi so theo tiếng Việt và số trong chuỗi. */
export function sortRows<T, K extends string>(rows: T[], sort: Sort<K>,
  get: (row: T, key: K) => string | number | null | undefined): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const x = get(a, key), y = get(b, key);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const c = typeof x === "number" && typeof y === "number"
      ? x - y : String(x).localeCompare(String(y), "vi", { numeric: true });
    return c * dir;
  });
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m4 8 3-5h10l3 5v12H4ZM4 8h5l1 4h4l1-4h5" /></svg><span>{children}</span></div>;
}

export function LoadingWorkspace({ label }: { label: string }) {
  return <main className="workspace-loading" role="status" aria-live="polite"><div className="loading-brand">TOBOKI</div><p>{label}</p><div className="skeleton skeleton-title" /><div className="loading-stats">{[1, 2, 3, 4].map((key) => <div className="skeleton" key={key} />)}</div><div className="skeleton skeleton-panel" /></main>;
}

type Toast = { id: number; level: string; text: string };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((level: string, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-4), { id, level, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), level === "error" ? 8000 : 5000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`}>
          <span>{t.text}</span><button type="button" className="toast-dismiss" aria-label="Đóng thông báo" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

/** Chạy một thao tác async, báo lỗi/thành công qua toast; trả về hàm và trạng thái đang chạy. */
export function useAction(push: (level: string, text: string) => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) push("success", success);
      return true;
    } catch (e) {
      push("error", (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [push]);
  return { run, busy };
}
