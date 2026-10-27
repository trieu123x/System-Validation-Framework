"use client";

import { useCallback, useEffect, useState } from "react";
import { api, UNAUTHORIZED, useDebounced, useEvents } from "@/lib/api";
import type { Branch, LogRow, Product, RequestRow, SecurityEventRow, Stats } from "@/lib/types";
import { Dot, Shell, Toasts, useToasts } from "@/components/ui";
import { CompanyFooter, CompanyLogin, LoginScreen } from "@/components/Login";
import { COMPANY } from "@/lib/company";
import { NO_FILTER, Overview, type OverviewFilter } from "@/components/admin/Overview";
import { Products } from "@/components/admin/Products";
import { Reconcile, RequestHistory, Transfers } from "@/components/admin/Records";
import { Warehouses } from "@/components/admin/Warehouses";
import { Notices } from "@/components/admin/Notices";
import { Security } from "@/components/admin/Security";
import { Debts } from "@/components/admin/Debts";

type Tab = "overview" | "products" | "stock" | "debts" | "history" | "transfers" | "broadcast" | "monitor" | "reconcile";

/** Cổng đăng nhập công ty: chưa có phiên (hoặc phiên hết hạn) thì hiện trang đăng nhập. */
export default function AdminPage() {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (/^#reset=[A-Za-z0-9_-]{43}$/.test(window.location.hash)) { setUser(null); return; }
    api<{ loggedIn: boolean; user: string }>("/api/auth/me")
      .then((r) => setUser(r.loggedIn ? r.user : null))
      .catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener(UNAUTHORIZED, expired);
    // Keep the active Admin lease alive while this browser is open.
    // A closed browser stops heartbeats; the server releases the session automatically.
    const heartbeat = window.setInterval(() => {
      api<{ loggedIn: boolean; user: string }>("/api/auth/me")
        .then((r) => { if (!r.loggedIn) setUser(null); })
        .catch(() => {});
    }, 30_000);
    return () => { window.clearInterval(heartbeat); window.removeEventListener(UNAUTHORIZED, expired); };
  }, []);

  if (user === undefined) {
    return <main className="center"><p className="muted">Đang mở...</p></main>;
  }
  if (user === null) {
    return <LoginScreen side="company"><CompanyLogin onDone={setUser} /></LoginScreen>;
  }
  return <AdminApp user={user} onLogout={() => api("/api/auth/logout", {}).finally(() => setUser(null))} />;
}

function AdminApp({ user, onLogout }: { user: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { toasts, push, dismiss } = useToasts();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [alerts, setAlerts] = useState<RequestRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [live, setLive] = useState<LogRow[]>([]);
  const [showSim, setShowSim] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>(NO_FILTER);
  const [v, setV] = useState({ stock: 0, requests: 0, transfers: 0, products: 0, debts: 0, security: 0, notices: 0 });

  const bump = (k: keyof typeof v) => setV((x) => ({ ...x, [k]: x[k] + 1 }));
  const flash = (maYc: number) => {
    setFresh((s) => new Set(s).add(maYc));
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(maYc); return n; }), 3000);
  };

  const loadBranches = useCallback(() => api<Branch[]>("/api/branches").then(setBranches).catch(() => {}), []);
  const loadAlerts = useCallback(() => api<RequestRow[]>("/api/alerts").then(setAlerts).catch(() => {}), []);
  const loadRequests = useCallback(() => api<RequestRow[]>("/api/requests").then(setRequests).catch(() => {}), []);
  const loadProducts = useCallback(() => api<Product[]>("/api/products").then(setProducts).catch(() => {}), []);
  const loadStats = useCallback(() => api<Stats>("/api/stats").then(setStats).catch(() => {}), []);

  useEffect(() => {
    loadBranches(); loadAlerts(); loadRequests(); loadProducts(); loadStats();
    const t = setInterval(loadStats, 5000);
    return () => clearInterval(t);
  }, [loadBranches, loadAlerts, loadRequests, loadProducts, loadStats]);

  // Khi giả lập tải, sự kiện đến dồn dập: gộp lại để không tải lại liên tục
  const refreshRequests = useDebounced(() => { loadAlerts(); loadRequests(); loadBranches(); bump("requests"); }, 400);
  const refreshStock = useDebounced(() => { bump("stock"); bump("transfers"); }, 1500);
  const refreshProducts = useDebounced(() => { loadProducts(); bump("products"); bump("stock"); }, 800);
  const refreshTransfers = useDebounced(() => { bump("transfers"); loadRequests(); }, 400);
  const refreshBranches = useDebounced(loadBranches, 300);
  const refreshDebts = useDebounced(() => bump("debts"), 800);
  const refreshSecurity = useDebounced(() => bump("security"), 500);
  const [highCount, setHighCount] = useState(0);
  const [duplicateAlert, setDuplicateAlert] = useState<SecurityEventRow | null>(null);
  const isSim = (maCn: string) => maCn.startsWith("SIM");

  const connected = useEvents({
    branches: () => refreshBranches(),
    alert: (a: RequestRow) => {
      // FR-15: popup khi có cảnh báo mới (chi nhánh ảo của bộ giả lập tải thì không làm phiền)
      if (showSim || !isSim(a.maCn)) {
        push("alert", `⚠ ${a.tenCn} cần hàng: ${a.tenSp} (tồn ${a.soLuongCon}/${a.nguong})`);
      }
      flash(a.maYc);
      refreshRequests();
    },
    request: (r: RequestRow) => {
      if (showSim || !isSim(r.maCn)) {
        if (r.trangThai === "HOAN_TAT") {
          const delta = r.chenhLech ?? 0;
          push(delta === 0 ? "success" : "error", `${r.tenCn} nhận ${r.soLuongNhan ?? r.soLuongGiao}/${r.soLuongGiao} ${r.tenSp} (YC${r.maYc})${delta === 0 ? " — đủ hàng" : ` — ${delta > 0 ? "THỪA" : "THIẾU"} ${Math.abs(delta)}`}`);
        }
        if (r.trangThai === "TU_CHOI") push("warn", `${r.tenCn} từ chối yêu cầu YC${r.maYc} (${r.tenSp})`);
      }
      flash(r.maYc);
      refreshRequests();
    },
    stock: () => refreshStock(),
    products: () => refreshProducts(),
    transfer: () => refreshTransfers(),
    debt: () => refreshDebts(),
    notice: () => bump("notices"),
    security: (e: SecurityEventRow) => {
      if (e.loai === "DUPLICATE_LOGIN") setDuplicateAlert(e);
      if (e.muc === "HIGH") {
        push("error", `🛡 ${e.loai}${e.ip ? ` từ ${e.ip}` : ""}${e.maCn ? ` (${e.maCn})` : ""}: ${e.chiTiet ?? ""}`.slice(0, 220));
        if (tab !== "monitor") setHighCount((n) => n + 1);
      }
      refreshSecurity();
    },
    message: (m: LogRow) => setLive((l) => [m, ...l].slice(0, 300)),
  });

  const realBranches = branches.filter((b) => showSim || !b.giaLap);
  const online = branches.filter((b) => b.online && !b.giaLap).length;
  const shortage = requests.filter((r) => r.trangThai === "THIEU_HANG" && (showSim || !isSim(r.maCn))).length;
  const shownAlerts = alerts.filter((a) => showSim || !isSim(a.maCn));
  const TITLES: Record<Tab, string> = {
    overview: "Tổng quan", products: "Hàng hóa & kho tổng", stock: "Quản lý kho chi nhánh", debts: "Công nợ",
    history: "Yêu cầu cấp hàng",
    transfers: "Điều chuyển hàng", broadcast: "Thông báo tới chi nhánh", monitor: "Giám sát an ninh", reconcile: "Đối soát kho",
  };

  return (
    <>
      <Shell<Tab> brand={COMPANY.brand} sub="Quản trị công ty" value={tab} title={TITLES[tab]}
        onChange={(t) => { setTab(t); if (t === "monitor") setHighCount(0); }}
        nav={[
          { id: "overview", label: "Tổng quan", count: shownAlerts.length, tone: "danger" },
          { id: "products", label: "Hàng hóa" },
          { id: "stock", label: "Kho chi nhánh" },
          { id: "debts", label: "Công nợ" },
          { id: "history", label: "Yêu cầu cấp hàng", count: requests.filter((r) => r.chenhLech != null && r.chenhLech !== 0 && (showSim || !isSim(r.maCn))).length, tone: "danger" },
          { id: "transfers", label: "Điều chuyển", count: shortage, tone: "warn" },
          { id: "broadcast", label: "Thông báo" },
          { id: "monitor", label: "Giám sát", count: highCount, tone: "danger" },
          { id: "reconcile", label: "Đối soát" },
        ]}
        status={
          <>
            <span>{online} chi nhánh online</span>
            <span title={connected ? "Đang nhận thông báo trực tiếp" : "Không nhận được thông báo trực tiếp"}>
              <Dot on={connected} />{connected ? "Đã nối server" : "Mất kết nối server"}
            </span>
            <span>{user}</span>
            <button className="btn btn-sm" onClick={onLogout}>Đăng xuất</button>
          </>
        }
        actions={(tab === "overview" || tab === "debts") && (
          <label className="row muted">
            <input type="checkbox" checked={showSim} onChange={(e) => setShowSim(e.target.checked)} /> Hiện chi nhánh kiểm thử
          </label>
        )}>
        {duplicateAlert && (
          <div className="banner banner-danger" role="alert" style={{ marginBottom: 16 }}>
            <strong>Cảnh báo đăng nhập trùng: {duplicateAlert.maCn || "Admin"}</strong>
            {" — "}Thiết bị khác đã thử đăng nhập nhưng bị từ chối. Phiên đang sử dụng vẫn được giữ nguyên.
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => { setTab("monitor"); setHighCount(0); }}>Xem sự kiện</button>
              <button type="button" className="btn btn-sm" onClick={() => setDuplicateAlert(null)}>Đóng</button>
            </div>
          </div>
        )}
        {tab === "overview" && (
          <Overview branches={branches} products={products} alerts={shownAlerts} requests={requests} stats={stats}
            freshIds={fresh} showSim={showSim} push={push} live={live} go={setTab}
            filter={overviewFilter} setFilter={setOverviewFilter} />
        )}
        {tab === "products" && <Products products={products} version={v.products} push={push} />}
        {tab === "stock" && <Warehouses products={products} version={v.stock + v.requests + v.debts} push={push} />}
        {tab === "debts" && <Debts version={v.debts + v.requests} showSim={showSim} push={push} />}
        {tab === "history" && <RequestHistory branches={realBranches} products={products} version={v.requests} />}
        {tab === "transfers" && <Transfers version={v.transfers} />}
        {tab === "broadcast" && (
          <Notices products={products} branches={branches} version={v.notices + v.stock + v.requests} push={push} />
        )}
        {tab === "monitor" && (
          <Security version={v.security} live={live} branches={branches} clearLive={() => setLive([])} push={push} />
        )}
        {tab === "reconcile" && <Reconcile version={v.stock + v.requests + v.products} />}
      </Shell>
      <CompanyFooter />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}
