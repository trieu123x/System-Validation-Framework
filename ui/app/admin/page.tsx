"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, UNAUTHORIZED, useDebounced, useEvents } from "@/lib/api";
import type { Branch, LogRow, Product, RequestRow, SecurityEventRow, Stats } from "@/lib/types";
import { Dot, LoadingWorkspace, Shell, Toasts, useToasts, type BackAction } from "@/components/ui";
import { CompanyFooter, CompanyLogin, LoginScreen } from "@/components/Login";
import { NO_FILTER, Overview, type OverviewFilter } from "@/components/admin/Overview";
import { Products } from "@/components/admin/Products";
import { Reconcile, RequestHistory, Transfers } from "@/components/admin/Records";
import { Warehouses } from "@/components/admin/Warehouses";
import { Notices } from "@/components/admin/Notices";
import { Security } from "@/components/admin/Security";
import { Debts } from "@/components/admin/Debts";
import { useWorkspaceNavigation } from "@/lib/navigation";
import dynamic from "next/dynamic";

// Tải riêng màn Kinh doanh; biểu đồ Tổng quan cũng được tải riêng trong Overview.
const Business = dynamic(() => import("@/components/admin/Business").then((m) => m.Business), {
  ssr: false, loading: () => <p className="empty" role="status">Đang tải thống kê...</p>,
});

type Tab = "overview" | "products" | "stock" | "debts" | "business" | "history" | "transfers" | "broadcast" | "monitor" | "reconcile";
const ADMIN_VIEWS: readonly Tab[] = ["overview", "products", "stock", "debts", "business", "history", "transfers", "broadcast", "monitor", "reconcile"];

/** Cổng đăng nhập công ty: chưa có phiên (hoặc phiên hết hạn) thì hiện trang đăng nhập. */
export default function AdminPage() {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (/^#reset=[A-Za-z0-9_-]{43}$/.test(window.location.hash)) { setUser(null); return; }
    let active = true;
    const checkSession = () => api<{ loggedIn: boolean; user: string }>("/api/auth/me")
      .then((r) => { if (active) setUser(r.loggedIn ? r.user : null); })
      .catch(() => { if (active) setUser(null); });
    void checkSession();
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted && !window.location.hash.startsWith("#reset=")) { setUser(undefined); void checkSession(); }
    };
    window.addEventListener("pageshow", restored);
    const expired = () => setUser(null);
    window.addEventListener(UNAUTHORIZED, expired);
    // Keep the active Admin lease alive while this browser is open.
    // A closed browser stops heartbeats; the server releases the session automatically.
    const heartbeat = window.setInterval(() => {
      api<{ loggedIn: boolean; user: string }>("/api/auth/me")
        .then((r) => { if (!r.loggedIn) setUser(null); })
        .catch(() => {});
    }, 30_000);
    return () => { active = false; window.clearInterval(heartbeat); window.removeEventListener(UNAUTHORIZED, expired); window.removeEventListener("pageshow", restored); };
  }, []);

  if (user === undefined) {
    return <LoadingWorkspace label="Đang tải..." />;
  }
  if (user === null) {
    return <LoginScreen side="company"><CompanyLogin onDone={setUser} /></LoginScreen>;
  }
  return <AdminApp user={user} onLogout={() => api("/api/auth/logout", {}).finally(() => setUser(null))} />;
}

function AdminApp({ user, onLogout }: { user: string; onLogout: () => void }) {
  const { view: tab, navigate: openView, goBack: previousView } = useWorkspaceNavigation<Tab>({ scope: "admin", initial: "overview", views: ADMIN_VIEWS });
  const [contextBack, setContextBack] = useState<BackAction | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [alerts, setAlerts] = useState<RequestRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [businessPart, setBusinessPart] = useState<"overview" | "products" | "branches">("overview");
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [live, setLive] = useState<LogRow[]>([]);
  const [showSim, setShowSim] = useState(false);
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>(NO_FILTER);
  const [v, setV] = useState({ stock: 0, requests: 0, transfers: 0, products: 0, debts: 0, security: 0, notices: 0, business: 0 });
  const [loadError, setLoadError] = useState("");
  const acceptanceNotices = useRef(new Set<string>());

  const bump = (k: keyof typeof v) => setV((x) => ({ ...x, [k]: x[k] + 1 }));
  const flash = (maYc: number) => {
    setFresh((s) => new Set(s).add(maYc));
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(maYc); return n; }), 3000);
  };

  const loadBranches = useCallback(() => api<Branch[]>("/api/branches").then(setBranches).catch((error: Error) => setLoadError(error.message)), []);
  const loadAlerts = useCallback(() => api<RequestRow[]>("/api/alerts").then(setAlerts).catch((error: Error) => setLoadError(error.message)), []);
  const loadRequests = useCallback(() => api<RequestRow[]>("/api/requests").then(setRequests).catch((error: Error) => setLoadError(error.message)), []);
  const loadProducts = useCallback(() => api<Product[]>("/api/products").then(setProducts).catch((error: Error) => setLoadError(error.message)), []);
  const loadStats = useCallback(() => api<Stats>("/api/stats").then(setStats).catch((error: Error) => setLoadError(error.message)), []);

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
  // Kinh doanh: truy vấn gộp nặng hơn, gom sự kiện 5 giây rồi mới tải lại
  const refreshBusiness = useDebounced(() => bump("business"), 5000);
  const [highCount, setHighCount] = useState(0);
  useEffect(() => { if (tab === "monitor") setHighCount(0); }, [tab]);
  const navigate = (next: Tab) => {
    if (next === tab) return;
    if (next === "business") setBusinessPart("overview");
    setContextBack(null);
    openView(next);
  };
  const goBack = () => {
    setContextBack(null);
    previousView();
  };
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
        if (r.trangThai === "DA_CHAP_NHAN") {
          const key = `${r.maYc}:${r.soLuongChot}`;
          if (!acceptanceNotices.current.has(key)) {
            acceptanceNotices.current.add(key);
            if (acceptanceNotices.current.size > 500) {
              const oldest = acceptanceNotices.current.values().next().value;
              if (oldest !== undefined) acceptanceNotices.current.delete(oldest);
            }
            push("success", `${r.tenCn} đã đồng ý bổ sung ${r.soLuongChot} ${r.tenSp} (YC${r.maYc}). Mở Tổng quan → Chờ xuất hàng để xuất kho.`);
          }
        }
        if (r.trangThai === "HOAN_TAT") {
          const delta = r.chenhLech ?? 0;
          push(delta === 0 ? "success" : "error", `${r.tenCn} nhận ${r.soLuongNhan ?? r.soLuongGiao}/${r.soLuongGiao} ${r.tenSp} (YC${r.maYc})${delta === 0 ? " — đủ hàng" : ` — ${delta > 0 ? "THỪA" : "THIẾU"} ${Math.abs(delta)}`}`);
        }
        if (r.trangThai === "TU_CHOI") push("warn", `${r.tenCn} từ chối yêu cầu YC${r.maYc} (${r.tenSp})`);
      }
      flash(r.maYc);
      refreshRequests();
      refreshBusiness();
    },
    stock: () => { refreshStock(); refreshBusiness(); },
    products: () => refreshProducts(),
    transfer: () => refreshTransfers(),
    debt: () => { refreshDebts(); refreshBusiness(); },
    business: () => refreshBusiness(),
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
    overview: "Tổng quan vận hành", products: "Hàng hóa & kho tổng", stock: "Quản lý kho chi nhánh", debts: "Công nợ",
    business: "Kinh doanh",
    history: "Yêu cầu cấp hàng",
    transfers: "Điều chuyển hàng", broadcast: "Thông báo tới chi nhánh", monitor: "Giám sát hệ thống", reconcile: "Đối soát kho",
  };

  return (
    <>
      <Shell<Tab> sub="Quản trị công ty" value={tab} title={TITLES[tab]}
        catalogView="products"
        className={`admin-shell admin-view-${tab}`} description={{
          overview: "Ưu tiên yêu cầu thiếu hàng, theo dõi giao nhận và kết nối chi nhánh.",
          products: "Danh mục thiết bị, giá bán và nguồn hàng tại kho tổng.",
          stock: "Nắm tình hình tồn kho và chủ động bổ sung hàng cho từng chi nhánh.",
          debts: "Theo dõi phải thu từ chi nhánh và phải trả cho nhà cung cấp.",
          business: "Doanh thu, lợi nhuận gộp, mặt hàng bán chạy và kết quả từng chi nhánh so với kỳ trước.",
          history: "Tra cứu tiến độ cấp hàng, giao nhận và các yêu cầu cần đối chiếu.",
          transfers: "Theo dõi điều chuyển thiết bị giữa các chi nhánh.",
          broadcast: "Gửi thông tin và tiếp nhận nhu cầu hàng hóa từ chi nhánh.",
          monitor: "Theo dõi kết nối, sự kiện bảo mật và hoạt động của hệ thống.",
          reconcile: "Đối chiếu hàng nhập, hàng xuất và số lượng thực nhận.",
        }[tab]}
        menu menuLabel="Chức năng quản trị" onChange={navigate} notificationId="broadcast"
        back={tab !== "overview" ? contextBack ?? { label: "Quay lại", onClick: goBack } : undefined}
        nav={[
          { id: "overview", label: "Tổng quan", count: shownAlerts.length, tone: "danger", group: "Vận hành" },
          { id: "history", label: "Yêu cầu cấp hàng", count: requests.filter((r) => r.chenhLech != null && r.chenhLech !== 0 && (showSim || !isSim(r.maCn))).length, tone: "danger", group: "Vận hành" },
          { id: "transfers", label: "Điều chuyển", count: shortage, tone: "warn", group: "Vận hành" },
          { id: "products", label: "Hàng hóa", group: "Hàng hóa & kho" },
          { id: "stock", label: "Kho chi nhánh", group: "Hàng hóa & kho" },
          { id: "business", label: "Kinh doanh", group: "Quản lý" },
          { id: "debts", label: "Công nợ", group: "Quản lý" },
          { id: "reconcile", label: "Đối soát", group: "Quản lý" },
          { id: "monitor", label: "Giám sát", count: highCount, tone: "danger", group: "Quản lý" },
          { id: "broadcast", label: "Thông báo" },
        ]}
        navigationStatus={
          <>
            <span className="admin-status-extra">{online} chi nhánh online</span>
            <span className="workspace-connection" role="status" title={connected ? "Đang nhận thông báo trực tiếp" : "Không nhận được thông báo trực tiếp"}>
              <Dot on={connected} />{connected ? "Đã kết nối" : "Mất kết nối"}
            </span>
            <span className="workspace-user">{user}</span>
          </>
        }
        status={<button className="btn btn-sm workspace-logout" onClick={onLogout}>Đăng xuất</button>}
        actions={(tab === "overview" || tab === "debts") && (
          <label className="row muted">
            <input type="checkbox" checked={showSim} onChange={(e) => setShowSim(e.target.checked)} /> Hiện chi nhánh kiểm thử
          </label>
        )}>
        {loadError && <div className="banner banner-danger" role="alert"><strong>Không tải được một phần dữ liệu.</strong> {loadError}<button type="button" className="btn btn-sm" style={{ marginLeft: 12 }} onClick={() => { setLoadError(""); loadBranches(); loadAlerts(); loadRequests(); loadProducts(); loadStats(); }}>Thử tải lại</button></div>}
        {duplicateAlert && (
          <div className="banner banner-danger" role="alert" style={{ marginBottom: 16 }}>
            <strong>Cảnh báo đăng nhập trùng: {duplicateAlert.maCn || "Admin"}</strong>
            {" — "}Thiết bị khác đã thử đăng nhập nhưng bị từ chối. Phiên đang sử dụng vẫn được giữ nguyên.
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => navigate("monitor")}>Xem sự kiện</button>
              <button type="button" className="btn btn-sm" onClick={() => setDuplicateAlert(null)}>Đóng</button>
            </div>
          </div>
        )}
        {tab === "overview" && (
          <Overview branches={branches} products={products} alerts={shownAlerts} requests={requests} stats={stats} businessVersion={v.business}
            onOpenBusiness={(part) => { navigate("business"); setBusinessPart(part); }}
            freshIds={fresh} showSim={showSim} push={push} live={live} go={navigate}
            filter={overviewFilter} setFilter={setOverviewFilter} />
        )}
        {tab === "products" && <Products products={products} version={v.products} push={push} onBackChange={setContextBack} />}
        {tab === "stock" && <Warehouses products={products} version={v.stock + v.requests + v.debts} push={push} onBackChange={setContextBack} />}
        {tab === "business" && <Business version={v.business} push={push} onBackChange={setContextBack} initialPart={businessPart} />}
        {tab === "debts" && <Debts version={v.debts + v.requests} showSim={showSim} push={push} onBackChange={setContextBack} />}
        {tab === "history" && <RequestHistory branches={realBranches} products={products} version={v.requests} push={push} />}
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
