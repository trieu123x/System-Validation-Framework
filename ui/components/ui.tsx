"use client";

import { ReactNode, useCallback, useState } from "react";
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
export function ProductImage({ src, alt, category, size = 40 }: {
  src: string | null | undefined; alt: string; category?: string; size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src, size * 2);
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

export type NavItem<T extends string> = { id: T; label: string; count?: number; tone?: string };

/** Khung trang kiểu phần mềm quản lý: thanh menu ngang trên cùng, dưới là thanh tiêu đề trang và nội dung. */
export function Shell<T extends string>({ brand, sub, nav, value, onChange, status, title, actions, children }: {
  brand: string; sub?: ReactNode; nav: NavItem<T>[]; value: T; onChange: (t: T) => void;
  status?: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <header className="appbar">
        <div className="appbar-brand">
          <b>{brand}</b>
          {sub && <span>{sub}</span>}
        </div>
        <nav className="appbar-nav">
          {nav.map((n) => (
            <button key={n.id} className={n.id === value ? "active" : ""}
              aria-current={n.id === value ? "page" : undefined} onClick={() => onChange(n.id)}>
              {n.label}
              {n.count ? <span className={`nav-count ${n.tone ? "count-" + n.tone : ""}`}>{n.count}</span> : null}
            </button>
          ))}
        </nav>
        {status && <div className="appbar-status">{status}</div>}
      </header>
      <div className="subbar">
        <h1>{title}</h1>
        <div className="spacer" />
        {actions}
      </div>
      <main className="page">{children}</main>
    </>
  );
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
    <th className={num ? "num" : undefined} aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}>
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
  return <p className="empty">{children}</p>;
}

export type Toast = { id: number; level: string; text: string };

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
        <div key={t.id} className={`toast toast-${t.level}`} onClick={() => dismiss(t.id)}>
          {t.text}
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
