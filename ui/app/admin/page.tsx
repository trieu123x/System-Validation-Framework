"use client";

import { useCallback, useEffect, useState } from "react";
import { api, UNAUTHORIZED, useDebounced, useEvents } from "@/lib/api";
import type { Branch, LogRow, Product, RequestRow, Stats } from "@/lib/types";
import { Dot, Shell, Toasts, useToasts } from "@/components/ui";
import { CompanyLogin, LoginScreen } from "@/components/Login";
import { Overview } from "@/components/admin/Overview";
import { Products } from "@/components/admin/Products";
import { BranchStock, Reconcile, RequestHistory, Transfers } from "@/components/admin/Records";
import { Broadcast, Monitor } from "@/components/admin/Comms";

type Tab = "overview" | "products" | "stock" | "history" | "transfers" | "broadcast" | "monitor" | "reconcile";

/** Cổng đăng nhập công ty: chưa có phiên (hoặc phiên hết hạn) thì hiện trang đăng nhập. */
export default function AdminPage() {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api<{ loggedIn: boolean; user: string }>("/api/auth/me")
      .then((r) => setUser(r.loggedIn ? r.user : null))
      .catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener(UNAUTHORIZED, expired);
    return () => window.removeEventListener(UNAUTHORIZED, expired);
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
  const [v, setV] = useState({ stock: 0, requests: 0, transfers: 0, products: 0 });

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
        if (r.trangThai === "HOAN_TAT") push("success", `${r.tenCn} đã nhận ${r.soLuongGiao} ${r.tenSp} (YC${r.maYc})`);
        if (r.trangThai === "TU_CHOI") push("warn", `${r.tenCn} từ chối yêu cầu YC${r.maYc} (${r.tenSp})`);
      }
      flash(r.maYc);
      refreshRequests();
    },
    stock: () => refreshStock(),
    products: () => refreshProducts(),
    transfer: () => refreshTransfers(),
    message: (m: LogRow) => setLive((l) => [m, ...l].slice(0, 300)),
  });

  const realBranches = branches.filter((b) => showSim || !b.giaLap);
  const online = branches.filter((b) => b.online && !b.giaLap).length;
  const shortage = requests.filter((r) => r.trangThai === "THIEU_HANG" && (showSim || !isSim(r.maCn))).length;
  const shownAlerts = alerts.filter((a) => showSim || !isSim(a.maCn));
  const TITLES: Record<Tab, string> = {
    overview: "Tổng quan", products: "Hàng hóa & kho tổng", stock: "Tồn kho chi nhánh", history: "Yêu cầu cấp hàng",
    transfers: "Điều chuyển hàng", broadcast: "Gửi thông báo tới chi nhánh", monitor: "Giám sát giao thức", reconcile: "Đối soát kho",
  };

  return (
    <>
      <Shell<Tab> brand="Phân phối hàng hóa" sub="Quản trị công ty" value={tab} onChange={setTab} title={TITLES[tab]}
        nav={[
          { id: "overview", label: "Tổng quan", count: shownAlerts.length, tone: "danger" },
          { id: "products", label: "Hàng hóa" },
          { id: "stock", label: "Kho chi nhánh" },
          { id: "history", label: "Yêu cầu cấp hàng" },
          { id: "transfers", label: "Điều chuyển", count: shortage, tone: "warn" },
          { id: "broadcast", label: "Thông báo" },
          { id: "monitor", label: "Giám sát" },
          { id: "reconcile", label: "Đối soát" },
        ]}
        status={
          <>
            <span>{online} chi nhánh online</span>
            <span title={connected ? "Đang nhận sự kiện từ server.jar" : "Không nhận được sự kiện từ server.jar"}>
              <Dot on={connected} />{connected ? "Đã nối server" : "Mất kết nối server"}
            </span>
            <span>{user}</span>
            <button className="btn btn-sm" onClick={onLogout}>Đăng xuất</button>
          </>
        }
        actions={tab === "overview" && (
          <label className="row muted">
            <input type="checkbox" checked={showSim} onChange={(e) => setShowSim(e.target.checked)} /> Hiện chi nhánh ảo (giả lập tải)
          </label>
        )}>
        {tab === "overview" && (
          <Overview branches={branches} alerts={shownAlerts} requests={requests} stats={stats} freshIds={fresh}
            showSim={showSim} push={push} live={live} go={setTab} />
        )}
        {tab === "products" && <Products products={products} version={v.products} push={push} />}
        {tab === "stock" && <BranchStock branches={realBranches} version={v.stock} />}
        {tab === "history" && <RequestHistory branches={realBranches} products={products} version={v.requests} />}
        {tab === "transfers" && <Transfers version={v.transfers} />}
        {tab === "broadcast" && <Broadcast push={push} />}
        {tab === "monitor" && <Monitor live={live} branches={branches} clearLive={() => setLive([])} />}
        {tab === "reconcile" && <Reconcile version={v.stock + v.requests + v.products} />}
      </Shell>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}
