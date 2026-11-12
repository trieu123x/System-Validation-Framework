"use client";

import { useEffect, useRef, useState } from "react";
import { api, fmtMoney, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Branch, LogRow, Product, RequestRow, Stats } from "@/lib/types";
import { Card, Dot, Empty, FilterBar, ProductImage, StateBadge, useAction } from "@/components/ui";
import dynamic from "next/dynamic";
import { RequestShipment } from "./RequestShipment";
import "./overview.css";

const OverviewStatistics = dynamic(() => import("./OverviewStatistics").then((module) => module.OverviewStatistics), {
  ssr: false, loading: () => <p className="empty" role="status">Đang tải thống kê...</p>,
});

const RECENT = new Set(["DA_DE_XUAT", "DA_CHAP_NHAN", "THIEU_HANG", "DA_GIAO", "HOAN_TAT", "TU_CHOI"]);
export type OverviewFilter = { q: string; maCn: string; maSp: string; trangThai: string; ketNoi: "" | "online" | "offline" };
export const NO_FILTER: OverviewFilter = { q: "", maCn: "", maSp: "", trangThai: "", ketNoi: "" };
type Go = (tab: "history" | "stock" | "monitor" | "transfers" | "business") => void;
type Push = (level: string, text: string) => void;

const ACTIVITY: Record<string, string> = {
  LOGIN_OK: "đăng nhập", LOGOUT: "đăng xuất", LOW_STOCK: "báo thiếu hàng",
  OFFER: "nhận đề xuất cấp", ACCEPT: "đồng ý nhận", REJECT: "từ chối đề xuất",
  DELIVERED: "đã được xuất hàng", OUT_OF_STOCK: "báo kho tổng không đủ", RECEIVED: "xác nhận đã nhận hàng",
  TRANSFER_REQ: "nhận yêu cầu điều chuyển", TRANSFER_ACCEPT: "đồng ý điều chuyển",
  TRANSFER_DONE: "đã chuyển hàng", BROADCAST: "nhận thông báo", ERROR: "bị trả lỗi",
};

function OverviewIcon({ name }: { name: "alert" | "truck" | "box" | "network" | "arrow" | "filter" }) {
  const paths = {
    alert: "m12 3 10 18H2L12 3Zm0 6v4m0 4h.01",
    truck: "M3 5h11v12H3ZM14 9h4l3 4v4h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    box: "m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5",
    network: "M9 3h6v6H9ZM2 15h6v6H2ZM16 15h6v6h-6ZM12 9v3M5 15v-3h14v3",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    filter: "M4 6h16M7 12h10M10 18h4",
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function Metric({ label, value, hint, tone, icon, onClick }: {
  label: string; value: number; hint: string; tone: string;
  icon: "alert" | "truck" | "box" | "network"; onClick: () => void;
}) {
  return <button type="button" className={`overview-metric metric-${tone}`} onClick={onClick}>
    <span className="metric-top"><span>{label}</span><span className="metric-icon"><OverviewIcon name={icon} /></span></span>
    <strong>{fmtNumber(value)}</strong>
    <span className="metric-bottom"><span>{hint}</span><OverviewIcon name="arrow" /></span>
  </button>;
}

export function Overview({ branches, products, alerts: allAlerts, requests, stats, businessVersion, onOpenBusiness, freshIds, showSim, push, live, go, filter: f, setFilter }: {
  branches: Branch[]; products: Product[]; alerts: RequestRow[]; requests: RequestRow[]; stats: Stats | null;
  businessVersion: number;
  onOpenBusiness: (part: "products" | "branches") => void;
  freshIds: Set<number>; showSim: boolean; push: Push; live: LogRow[]; go: Go;
  filter: OverviewFilter; setFilter: (f: OverviewFilter) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedFilters, setExpandedFilters] = useState(Boolean(f.maSp || f.trangThai || f.ketNoi));
  const [alertPage, setAlertPage] = useState(0);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [filtersOpen, setFiltersOpen] = useState(Object.values(f).some(Boolean));
  const alertSection = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<OverviewFilter>) => { setFilter({ ...f, ...patch }); setAlertPage(0); };
  const clear = () => { setFilter(NO_FILTER); setAlertPage(0); };
  const needle = f.q.trim().toLowerCase();
  const pool = branches.filter((b) => showSim || !b.giaLap);
  const byBranch = new Map(pool.filter((b) => (!f.maCn || b.maCn === f.maCn)
    && (!f.ketNoi || b.online === (f.ketNoi === "online"))).map((b) => [b.maCn, b]));
  const visible = [...byBranch.values()].filter((b) => !needle || `${b.maCn} ${b.ten}`.toLowerCase().includes(needle));
  const online = visible.filter((b) => b.online).length;
  const matches = (r: RequestRow) => byBranch.has(r.maCn) && (!f.maSp || r.maSp === f.maSp)
    && (!needle || `yc${r.maYc} ${r.maCn} ${r.tenCn} ${r.maSp} ${r.tenSp}`.toLowerCase().includes(needle));
  const alerts = allAlerts.filter(matches).sort((a, b) => b.mucThieu - a.mucThieu || a.maYc - b.maYc);
  const mine = requests.filter(matches);
  const readyToShip = mine.filter((r) => r.trangThai === "DA_CHAP_NHAN")
    .sort((a, b) => b.capNhatLuc.localeCompare(a.capNhatLuc));
  const shortage = mine.filter((r) => r.trangThai === "THIEU_HANG").length;
  const shipped = mine.filter((r) => r.trangThai === "DA_GIAO").length;
  const recent = mine.filter((r) => RECENT.has(r.trangThai) && (!f.trangThai || r.trangThai === f.trangThai))
    .sort((a, b) => b.capNhatLuc.localeCompare(a.capNhatLuc)).slice(0, 6);
  const activity = live.filter((m) => ACTIVITY[m.lenh] && !(m.maCn ?? "").startsWith("SIM")
    && (m.lenh !== "ERROR" || m.chieu === "OUT"))
    .filter((m) => m.maCn != null && byBranch.has(m.maCn) && (!needle || m.maCn.toLowerCase().includes(needle))).slice(0, 5);
  const filtering = Object.values(f).some(Boolean);
  const advancedFiltering = Boolean(f.maSp || f.trangThai || f.ketNoi);
  const selected = allAlerts.find((a) => a.maYc === selectedId);
  useEffect(() => { if (selectedId !== null && !selected) setSelectedId(null); }, [selectedId, selected]);
  const pageSize = 6;
  const page = Math.min(alertPage, Math.max(0, Math.ceil(alerts.length / pageSize) - 1));
  const pageAlerts = alerts.slice(page * pageSize, (page + 1) * pageSize);
  const productById = new Map(products.map((p) => [p.maSp, p]));
  const connectedPercent = visible.length ? Math.round(online / visible.length * 100) : 0;

  return <div className="operations-overview">
    <OverviewStatistics version={businessVersion} onSeeAll={onOpenBusiness} />
    <div className="overview-scope"><span><span className="scope-mark" />{filtering ? "Dữ liệu theo bộ lọc hiện tại" : "Toàn bộ hệ thống phân phối"}</span><span>{fmtNumber(pool.length)} chi nhánh{showSim ? " · gồm chi nhánh kiểm thử" : " vận hành"}</span></div>
    <div className="overview-metrics">
      <Metric label="Cảnh báo cần xử lý" value={alerts.length} hint={alerts.length ? "Xem yêu cầu thiếu hàng" : "Không có cảnh báo thiếu hàng"} tone={alerts.length ? "danger" : "neutral"} icon="alert" onClick={() => alertSection.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })} />
      <Metric label="Đang chờ nhận hàng" value={shipped} hint="Đã xuất hàng tới chi nhánh" tone="blue" icon="truck" onClick={() => go("history")} />
      <Metric label="Kho tổng không đủ" value={shortage} hint="Xem phương án điều chuyển" tone={shortage ? "amber" : "neutral"} icon="box" onClick={() => go("transfers")} />
      <Metric label="Chi nhánh mất kết nối" value={visible.length - online} hint={`${fmtNumber(online)}/${fmtNumber(visible.length)} chi nhánh đã kết nối`} tone="neutral" icon="network" onClick={() => { set({ ketNoi: f.ketNoi === "offline" ? "" : "offline" }); setExpandedFilters(true); setFiltersOpen(true); }} />
    </div>

    <div className="admin-overview-workbench"><aside className="admin-overview-sidebar">
      <details className="admin-filter-disclosure" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}><summary>Bộ lọc yêu cầu{filtering && <span className="admin-filter-dot" />}</summary>
    <div className="overview-filter-panel">
      <FilterBar active={filtering} onClear={clear}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Tìm yêu cầu, chi nhánh, mặt hàng…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <label className="field">Chi nhánh
          <select value={f.maCn} onChange={(e) => set({ maCn: e.target.value })}><option value="">Tất cả chi nhánh</option>{pool.map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn} – {b.ten}</option>)}</select>
        </label>
        <button type="button" className={`btn overview-filter-toggle${expandedFilters || advancedFiltering ? " is-active" : ""}`} aria-expanded={expandedFilters} aria-controls="overview-advanced-filters" onClick={() => setExpandedFilters((v) => !v)}><OverviewIcon name="filter" />Bộ lọc khác{advancedFiltering && <span className="filter-applied-dot" />}</button>
      </FilterBar>
      {expandedFilters && <div className="overview-advanced-filters" id="overview-advanced-filters">
        <label className="field">Mặt hàng<select value={f.maSp} onChange={(e) => set({ maSp: e.target.value })}><option value="">Tất cả mặt hàng</option>{products.map((p) => <option key={p.maSp} value={p.maSp}>{p.maSp} – {p.ten}</option>)}</select></label>
        <label className="field">Trạng thái đơn gần đây<select value={f.trangThai} onChange={(e) => set({ trangThai: e.target.value })}><option value="">Tất cả trạng thái</option>{[...RECENT].map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}</select></label>
        <label className="field">Kết nối chi nhánh<select value={f.ketNoi} onChange={(e) => set({ ketNoi: e.target.value as OverviewFilter["ketNoi"] })}><option value="">Tất cả kết nối</option><option value="online">Đã kết nối</option><option value="offline">Mất kết nối</option></select></label>
      </div>}
    </div>

      </details>
      <Card className="overview-branches" title="Kết nối chi nhánh" actions={<button type="button" className="btn-link" onClick={() => go("stock")}>Xem kho</button>}>
        <div className="overview-network-summary"><span><strong>{online}<span> / {visible.length}</span></strong><small>chi nhánh đã kết nối</small></span><span className="network-percentage">{connectedPercent}%</span></div>
        <div className="overview-network-meter" role="meter" aria-label="Tỷ lệ chi nhánh đã kết nối" aria-valuenow={connectedPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${connectedPercent}%` }} /></div>
        <div className="overview-network-legend"><span><Dot on />Đã kết nối</span><span><Dot on={false} />{visible.length - online} mất kết nối</span></div>
        {visible.length === 0 ? <Empty>Không có chi nhánh nào khớp bộ lọc.</Empty> : <ul className="overview-branch-list" tabIndex={0} aria-label="Danh sách kết nối chi nhánh">{visible.map((b) => <li key={b.maCn}><span className="branch-avatar">{b.maCn.slice(-2)}</span><span className="branch-information"><b>{b.ten}</b><small>{b.maCn}{b.ycMo ? ` · ${b.ycMo} yêu cầu mở` : ""}{b.tinCho ? ` · ${b.tinCho} tin chờ` : ""}</small></span><span className={`branch-connection${b.online ? " is-online" : ""}`} title={b.online ? "Đã kết nối" : "Mất kết nối"}><Dot on={b.online} /><span>{b.online ? "Online" : "Offline"}</span></span></li>)}</ul>}
      </Card>
    </aside><div className="admin-overview-main">
    {readyToShip.length > 0 && <Card title={<span className="overview-section-title">Chờ xuất hàng <span className="section-count">{readyToShip.length}</span></span>}
      actions={<button type="button" className="btn-link overview-text-action" onClick={() => go("history")}>Yêu cầu cấp hàng <OverviewIcon name="arrow" /></button>}>
      <p className="muted">Chi nhánh đã đồng ý bổ sung. Công ty kiểm tra và bấm Xuất hàng để tiếp tục.</p>
      <div className="table-wrap" tabIndex={0}><table className="overview-recent-table">
        <thead><tr><th scope="col">Yêu cầu / mặt hàng</th><th scope="col">Chi nhánh</th><th scope="col" className="num">Đã chấp nhận</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>{readyToShip.map((r) => <tr key={r.maYc} className={freshIds.has(r.maYc) ? "row-new" : ""}>
          <td><span className="overview-recent-product">{r.tenSp}</span><small className="overview-cell-secondary">YC{r.maYc} · {r.maSp}</small></td>
          <td><span className="overview-cell-name">{r.tenCn}</span><small className="overview-cell-secondary">{r.maCn}</small></td>
          <td className="num">{fmtNumber(r.soLuongChot)}</td>
          <td><RequestShipment request={r} push={push} /></td>
        </tr>)}</tbody>
      </table></div>
    </Card>}
    <div ref={alertSection} className="overview-alert-section">
      <Card className="overview-alert-card" title={<span className="overview-section-title">Cần xử lý <span className="section-count">{alerts.length}</span></span>}
        actions={<div className="admin-request-controls"><span className="overview-sort-note">Thiếu nhiều nhất trước</span><div className="catalog-view-switch" role="group" aria-label="Cách xem yêu cầu"><button type="button" aria-label="Xem thẻ yêu cầu" aria-pressed={view === "cards"} onClick={() => setView("cards")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z" /></svg></button><button type="button" aria-label="Xem bảng yêu cầu" aria-pressed={view === "table"} onClick={() => setView("table")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16" /></svg></button></div></div>}>
        {alerts.length === 0 ? <Empty>{filtering ? "Không có yêu cầu thiếu hàng khớp bộ lọc." : "Không có yêu cầu thiếu hàng cần xử lý."}</Empty> : <>
          {view === "cards" ? <div className="admin-request-grid">{pageAlerts.map((a) => {
            const product = productById.get(a.maSp);
            const canSupply = a.tonTong >= a.goiY;
            return <article key={a.maYc} className={`admin-request-card${freshIds.has(a.maYc) ? " request-fresh" : ""}`} aria-label={`Yêu cầu YC${a.maYc}`}>
              <div className="admin-request-image"><ProductImage src={product?.anhUrl} alt={a.tenSp} category={product?.tenDm} size={360} fit="limit" /><span className="admin-request-priority">{a.mucThieu > 0 ? `Thiếu ${fmtNumber(a.mucThieu)}${product?.donVi ? ` ${product.donVi}` : ""}` : "Yêu cầu bổ sung hàng"}</span></div>
              <div className="admin-request-content"><div className="admin-request-meta"><span>YC{a.maYc}</span><time>{a.taoLuc.slice(11, 16)} · {a.taoLuc.slice(8, 10)}/{a.taoLuc.slice(5, 7)}</time></div>
                <h3 title={a.tenSp}>{a.tenSp}</h3><span className="admin-request-code">{a.maSp}{product?.model ? ` · ${product.model}` : ""}</span>
                <div className="admin-request-branch"><span className="admin-branch-icon"><OverviewIcon name="network" /></span><span><b>{a.tenCn}</b><small>{a.maCn}</small></span></div>
                <dl className="admin-request-stock"><div><dt>Tồn / ngưỡng</dt><dd>{fmtNumber(a.soLuongCon)} <span>/ {fmtNumber(a.nguong)}</span></dd></div><div><dt>Kho tổng</dt><dd>{fmtNumber(a.tonTong)}</dd></div></dl>
                <p className={`admin-request-availability${canSupply ? " can-supply" : ""}`}><span />{canSupply ? "Kho đủ số lượng gợi ý" : "Cần kiểm tra nguồn hàng"}</p>
                {a.soLuongXin != null && <p className="admin-request-notice">Chi nhánh xin {fmtNumber(a.soLuongXin)} từ thông báo</p>}
                <button type="button" className="btn btn-primary admin-request-action" aria-label={`Xử lý yêu cầu YC${a.maYc}`} onClick={() => setSelectedId(a.maYc)}>Xử lý yêu cầu <OverviewIcon name="arrow" /></button>
              </div>
            </article>;
          })}</div> : <div className="table-wrap" tabIndex={0}><table className="overview-alert-table">
            <thead><tr><th scope="col">Yêu cầu</th><th scope="col">Chi nhánh</th><th scope="col">Mặt hàng</th><th scope="col" className="num">Tồn / ngưỡng</th><th scope="col" className="num">Còn thiếu</th><th scope="col" className="right">Thao tác</th></tr></thead>
            <tbody>{pageAlerts.map((a) => <tr key={a.maYc} className={freshIds.has(a.maYc) ? "row-new" : ""}>
              <td><button type="button" className="overview-request-link" onClick={() => setSelectedId(a.maYc)}>YC{a.maYc}</button><small className="overview-cell-secondary">{a.taoLuc.slice(11, 16)}</small></td>
              <td><span className="overview-cell-name">{a.tenCn}</span><small className="overview-cell-secondary">{a.maCn}</small></td>
              <td><span className="overview-product"><ProductImage src={productById.get(a.maSp)?.anhUrl} alt={a.tenSp} category={productById.get(a.maSp)?.tenDm} size={36} fit="contain" /><span><span className="overview-cell-name">{a.tenSp}</span><small className="overview-cell-secondary">{a.soLuongXin != null ? `Chi nhánh xin ${fmtNumber(a.soLuongXin)} · từ thông báo` : a.maSp}</small></span></span></td>
              <td className="num"><b>{fmtNumber(a.soLuongCon)}</b><span className="muted"> / {fmtNumber(a.nguong)}</span></td>
              <td className="num"><span className="overview-deficit">−{fmtNumber(a.mucThieu)}</span></td>
              <td className="right"><button type="button" className="btn btn-sm overview-process" onClick={() => setSelectedId(a.maYc)} aria-label={`Xử lý yêu cầu YC${a.maYc}`}>Xử lý <OverviewIcon name="arrow" /></button></td>
            </tr>)}</tbody>
          </table></div>}
          <div className="overview-table-footer"><span role="status">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, alerts.length)} trong {fmtNumber(alerts.length)} yêu cầu</span><div className="overview-pagination"><button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setAlertPage(page - 1)} aria-label="Trang yêu cầu trước">←</button><span>Trang {page + 1} / {Math.ceil(alerts.length / pageSize)}</span><button type="button" className="btn btn-sm" disabled={(page + 1) * pageSize >= alerts.length} onClick={() => setAlertPage(page + 1)} aria-label="Trang yêu cầu sau">→</button></div></div>
        </>}
      </Card>
    </div>

    <div className="overview-lower-grid">
      <div className="col">
        <Card title="Đơn hàng gần đây" actions={<button type="button" className="btn-link overview-text-action" onClick={() => go("history")}>Xem tất cả <OverviewIcon name="arrow" /></button>}>
          {recent.length === 0 ? <Empty>{filtering ? "Không có đơn nào khớp bộ lọc." : "Chưa có đơn hàng nào."}</Empty> : <div className="table-wrap" tabIndex={0}><table className="overview-recent-table"><thead><tr><th scope="col">Yêu cầu / mặt hàng</th><th scope="col">Chi nhánh</th><th scope="col" className="num">Số lượng</th><th scope="col">Trạng thái</th><th scope="col" className="right">Cập nhật</th></tr></thead><tbody>{recent.map((r) => <RecentRow key={r.maYc} r={r} fresh={freshIds.has(r.maYc)} push={push} />)}</tbody></table></div>}
        </Card>
        <Card title="Hoạt động gần đây" actions={<button type="button" className="btn-link overview-text-action" onClick={() => go("monitor")}>Giám sát <OverviewIcon name="arrow" /></button>}>
          {activity.length === 0 ? <Empty>Chưa có hoạt động kể từ khi mở trang.</Empty> : <div className="overview-activity-list">{activity.map((m, i) => <div key={m.thoiGian + i} className="overview-activity"><span className={`activity-marker${m.lenh === "ERROR" ? " activity-error" : ""}`} /><span><b>{m.maCn}</b> {ACTIVITY[m.lenh]}</span><time>{m.thoiGian.slice(11, 19)}</time></div>)}</div>}
          {stats && <div className="overview-monitor-note">{fmtNumber(stats.tinPhutQua)} tin nhắn/phút · Chi tiết kết nối tại Giám sát</div>}
        </Card>
      </div>

    </div>
    </div></div>
    {selected && <RequestDrawer key={selected.maYc} request={selected} product={productById.get(selected.maSp)} push={push} onClose={() => setSelectedId(null)} />}
  </div>;
}

function RequestDrawer({ request: a, product, push, onClose }: { request: RequestRow; product?: Product; push: Push; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState(String(a.goiY));
  const [confirming, setConfirming] = useState(false);
  const { run, busy: running } = useAction(push);
  const busy = running || confirming;
  const n = Number(qty);
  const valid = Number.isSafeInteger(n) && n > 0;
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    if (element && !element.open) element.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const act = async (action: "shortage" | "offer") => {
    if (busy || !valid) return;
    setConfirming(true);
    try {
      const messages = { shortage: `Đã báo ${a.tenCn}: kho tổng không đủ ${a.tenSp}`, offer: `Đã yêu cầu ${a.maCn} chấp nhận bổ sung YC${a.maYc}` };
      if (await run(() => api(`/api/requests/${a.maYc}/${action}`, { soLuong: n }), messages[action])) onClose();
    } finally { setConfirming(false); }
  };
  return <dialog className="overview-request-drawer" ref={dialog} aria-labelledby="request-drawer-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
    <div className="request-drawer-content">
      <header className="request-drawer-header"><div><span className="request-eyebrow">YÊU CẦU CẤP HÀNG</span><h2 id="request-drawer-title">Xử lý YC{a.maYc}</h2></div><button type="button" className="btn drawer-dismiss" onClick={() => dialog.current?.close()} aria-label="Đóng chi tiết yêu cầu">×</button></header>
      <form className="request-drawer-form" onSubmit={(e) => { e.preventDefault(); void act("offer"); }}>
        <div className="request-product"><ProductImage src={product?.anhUrl} alt={a.tenSp} category={product?.tenDm} size={64} fit="contain" /><div><b>{a.tenSp}</b><small>{a.maSp}{product?.donVi ? ` · Đơn vị: ${product.donVi}` : ""}</small></div></div>
        <dl className="request-facts"><div><dt>Chi nhánh yêu cầu</dt><dd>{a.tenCn}<small>{a.maCn}</small></dd></div><div><dt>Thời điểm tạo</dt><dd>{a.taoLuc.replace("T", " ").slice(0, 19)}</dd></div>{a.soLuongXin != null && <div><dt>Số lượng xin từ thông báo</dt><dd>{fmtNumber(a.soLuongXin)}</dd></div>}</dl>
        <div className="request-stock-grid"><div><span>Tồn chi nhánh</span><strong>{fmtNumber(a.soLuongCon)}</strong></div><div><span>Ngưỡng tối thiểu</span><strong>{fmtNumber(a.nguong)}</strong></div><div><span>Còn thiếu</span><strong className="request-shortage">{fmtNumber(a.mucThieu)}</strong></div></div>
        <div className="request-warehouse"><OverviewIcon name="box" /><span>Kho tổng hiện có</span><b>{fmtNumber(a.tonTong)}{product?.donVi ? ` ${product.donVi}` : ""}</b></div>
        <label className="field request-quantity">Số lượng yêu cầu bổ sung<input type="number" min={1} step={1} required value={qty} disabled={busy} onChange={(e) => setQty(e.target.value)} aria-describedby="request-quantity-hint" /><small id="request-quantity-hint">Số lượng gợi ý: {fmtNumber(a.goiY)}{valid ? ` · Giá trị dự kiến: ${fmtMoney(n * a.giaXuat)}` : " · Nhập số nguyên lớn hơn 0"}</small></label>
        {valid && n > a.tonTong && <div className="request-stock-warning" role="status">Kho tổng không đủ số lượng này. Bạn có thể gửi đề xuất hoặc báo không đủ hàng cho chi nhánh.</div>}
        <div className="request-action-area"><button type="submit" className="btn btn-primary" disabled={busy || !valid}>{busy ? "Đang xử lý…" : "Yêu cầu bổ sung"}</button><button type="button" className="btn request-shortage-action" disabled={busy || !valid} onClick={() => void act("shortage")}>Báo kho tổng không đủ hàng</button><p>Chưa xuất kho tại bước này. Sau khi chi nhánh chấp nhận, mở Yêu cầu cấp hàng để xuất hàng.</p></div>
      </form>
    </div>
  </dialog>;
}

function RecentRow({ r, fresh, push }: { r: RequestRow; fresh: boolean; push: Push }) {
  const qty = r.soLuongGiao ?? r.soLuongChot ?? r.soLuongDeXuat;
  return <tr className={fresh ? "row-new" : ""}>
    <td><span className="overview-recent-product">{r.tenSp}</span><small className="overview-cell-secondary">YC{r.maYc}</small></td>
    <td><span className="overview-cell-name">{r.tenCn}</span><small className="overview-cell-secondary">{r.maCn}</small></td>
    <td className="num">{fmtNumber(qty)}</td><td><StateBadge state={r.trangThai} /> <RequestShipment request={r} push={push} /></td>
    <td className="right overview-time">{r.capNhatLuc.slice(11, 16)}<small className="overview-cell-secondary">{r.capNhatLuc.slice(8, 10)}/{r.capNhatLuc.slice(5, 7)}</small></td>
  </tr>;
}
