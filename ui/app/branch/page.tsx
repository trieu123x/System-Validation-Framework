"use client";
import { PasswordRecovery, useRecoveryToken } from "@/components/PasswordRecovery";

import { FormEvent, useEffect, useState } from "react";
import {
  api, fmtMoney, fmtNumber, NOTICE_STATE_LABEL, NOTICE_STATE_TONE, NOTICE_TYPE_LABEL, STATE_LABEL, today, TRANSFER_LABEL, useEvents, UNAUTHORIZED,
} from "@/lib/api";
import type {
  BranchDebtInfo, BranchItem, BranchRequest, BranchSnapshot, BranchTransfer, ClientSecurityInfo, InboxItem, Notice,
} from "@/lib/types";
import {
  Badge, Card, Dot, Empty, Facet, FilterBar, FilterGroup, LEVEL_LABEL, Shell, SortTh, sortRows, Stat, StateBadge, StockBar, stockLevel,
  ProductImage, Toasts, useAction, useToasts, type Sort, type StockLevel,
} from "@/components/ui";
import { LoginScreen } from "@/components/Login";
import { EntryTable } from "@/components/admin/Debts";

type Tab = "stock" | "offers" | "transfers" | "debt" | "news" | "history" | "activity" | "security";
type Push = (level: string, text: string) => void;

const STATUS_TEXT: Record<BranchSnapshot["status"], string> = {
  ONLINE: "Đã kết nối",
  CONNECTED: "Đã nối, chưa đăng nhập",
  CONNECTING: "Đang kết nối...",
  DISCONNECTED: "Mất kết nối",
};

export default function BranchPage() {
  const [s, setS] = useState<BranchSnapshot | null>(null);
  const [forceRecovery, setForceRecovery] = useState(false);
  const [tab, setTab] = useState<Tab>("stock");
  const { toasts, push, dismiss } = useToasts();
  const [duplicateAlert, setDuplicateAlert] = useState<{ maCn: string; time: string; message: string } | null>(null);

  const agentUp = useEvents({
    state: (snap: BranchSnapshot) => setS(snap),
    toast: (n: Notice) => push(n.level, n.text),
    "duplicate-login": (alert: { maCn: string; time: string; message: string }) => {
      setDuplicateAlert(alert);
      push("error", alert.message);
    },
  }, !!s?.maCn);

  useEffect(() => {
    if (/^#reset=[A-Za-z0-9_-]{43}$/.test(window.location.hash)) setForceRecovery(true);
    api<BranchSnapshot>("/api/state").then(setS).catch(() => {});
  }, []);

  useEffect(() => {
    const reset = () => window.location.reload();
    window.addEventListener(UNAUTHORIZED, reset);
    return () => window.removeEventListener(UNAUTHORIZED, reset);
  }, []);

  // Separate browser presence from the gateway TCP connection. Each logged-in browser
  // sends a heartbeat; lost Wi-Fi or a closed browser is detected by server timeout.
  useEffect(() => {
    if (!s?.maCn) return;
    let active = true;
    const pulse = () => {
      if (!active) return;
      void fetch("/api/browser/heartbeat", { method: "POST", credentials: "same-origin", cache: "no-store" })
        .catch(() => { /* Network may be down; the server will time out this browser. */ });
    };
    pulse();
    const timer = window.setInterval(pulse, 10_000);
    window.addEventListener("online", pulse);
    const visibility = () => { if (document.visibilityState === "visible") pulse(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", pulse);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [s?.maCn]);

  // All branches use the same public URL /branch/; identity lives in the secure cookie.

  if (!s) {
    return <main className="center"><p className="muted">Đang mở ứng dụng chi nhánh...</p></main>;
  }
  if (forceRecovery || !s.maCn) {
    return (
      <>
        <Login snapshot={s} />
        <Toasts toasts={toasts} dismiss={dismiss} />
      </>
    );
  }

  const online = s.status === "ONLINE";
  const actionable = s.requests.filter((r) => ["DA_DE_XUAT", "THIEU_HANG", "DA_GIAO"].includes(r.trangThai)).length;
  const pendingTransfers = s.transfers.filter((t) => t.trangThai === "CHO").length;
  const low = s.inventory.filter((i) => stockLevel(i.soLuong, i.nguong) === "critical").length;
  const unread = (s.inbox ?? []).filter((n) => n.trangThai === "DA_GUI").length;
  const overLimit = !!s.debt && s.debt.conNo > s.debt.hanMuc;
  const sec = s.security;
  const spoof = !!sec && sec.discovery.length >= 2;

  const TITLES: Record<Tab, string> = {
    stock: "Bán hàng & tồn kho", offers: "Nhận hàng từ công ty", transfers: "Yêu cầu điều chuyển hàng",
    debt: "Công nợ với công ty", news: "Thông báo từ công ty", history: "Lịch sử nhập hàng", activity: "Nhật ký hoạt động",
    security: "An ninh máy chi nhánh",
  };

  return (
    <>
      <Shell<Tab> brand={s.tenCn ?? ""} sub={`TOBOKI · ${s.maCn} · server ${s.server || "—"}`} value={tab} onChange={setTab}
        title={TITLES[tab]}
        nav={[
          { id: "stock", label: "Bán hàng", count: low, tone: "danger" },
          { id: "offers", label: "Nhận hàng", count: actionable, tone: "warn" },
          { id: "transfers", label: "Điều chuyển", count: pendingTransfers, tone: "warn" },
          { id: "debt", label: "Công nợ", count: overLimit ? 1 : 0, tone: "danger" },
          { id: "news", label: "Thông báo", count: unread, tone: "warn" },
          { id: "history", label: "Lịch sử nhập" },
          { id: "activity", label: "Nhật ký" },
          { id: "security", label: "An ninh", count: sec?.suKien.length ?? 0, tone: "danger" },
        ]}
        status={
          <>
            <span title={s.statusDetail}><Dot on={online} />{STATUS_TEXT[s.status]}</span>
            <button className="btn btn-sm" onClick={() => api("/api/logout", {}).then(() => window.location.reload()).catch(() => {})}>Đăng xuất</button>
          </>
        }>
        {duplicateAlert && (
          <div className="banner banner-danger" role="alert" style={{ marginBottom: 16 }}>
            <strong>Cảnh báo bảo mật — {duplicateAlert.maCn}</strong>
            <p>{duplicateAlert.message}</p>
            <button className="btn btn-sm" type="button" onClick={() => setDuplicateAlert(null)}>Đã hiểu</button>
          </div>
        )}
        {!agentUp && <div className="banner banner-danger">Không kết nối được với dịch vụ chi nhánh.</div>}
        {agentUp && !online && (
          <div className="banner banner-warn">
            {s.statusDetail}. Dữ liệu bên dưới là bản cuối cùng nhận được; thao tác sẽ mở lại khi nối lại được server.
          </div>
        )}
        {(spoof || sec?.serverDoi) && (
          <div className="banner banner-danger">
            {spoof && <>Có {sec!.discovery.length} server cùng trả lời tìm server: {sec!.discovery.join(", ")}. Đang dùng {sec!.discovery[0]}; nếu không đúng server công ty, hãy nhập IP server khi đăng nhập. </>}
            {sec?.serverDoi && <>Server đã đổi địa chỉ ({sec.serverDoi}). </>}
            <button className="btn btn-sm" onClick={() => setTab("security")}>Xem chi tiết</button>
          </div>
        )}
        {tab === "stock" && <Stock items={s.inventory} requests={s.requests} reported={s.daBao ?? []} online={online} push={push} />}
        {tab === "offers" && <Offers requests={s.requests} items={s.inventory} online={online} push={push} />}
        {tab === "transfers" && <TransferList transfers={s.transfers} online={online} push={push} />}
        {tab === "debt" && <Debt debt={s.debt} />}
        {tab === "news" && <News items={s.broadcasts} inbox={s.inbox ?? []} inventory={s.inventory} online={online} push={push} />}
        {tab === "history" && <History s={s} online={online} push={push} />}
        {tab === "activity" && <Activity notices={s.notices} />}
        {tab === "security" && <SecurityTab sec={sec} />}
      </Shell>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}

function Login({ snapshot }: { snapshot: BranchSnapshot }) {
  const [maCn, setMaCn] = useState("");
  const [method, setMethod] = useState<"name" | "email">("name");
  const [recoveryToken, setRecoveryToken] = useRecoveryToken();
  const [forgot, setForgot] = useState(false);
  const [branchHint, setBranchHint] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { maCn: method === "email" ? maCn.trim().toLowerCase() : maCn.trim(), branchHint: method === "email" ? branchHint.trim().toUpperCase() : "", matKhau });
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoginScreen side="branch">
      {forgot || recoveryToken ? <PasswordRecovery scope="branch" token={recoveryToken}
        onCancel={() => { setForgot(false); setRecoveryToken(""); }} onDone={() => {}} /> :
      <form className="form-stack" onSubmit={submit}>
        <label className="field">Hình thức đăng nhập
          <select value={method} onChange={(e) => { setMethod(e.target.value as "name" | "email"); setMaCn(""); setBranchHint(""); }}>
            <option value="name">Tên hoặc mã chi nhánh</option>
            <option value="email">Email chi nhánh</option>
          </select>
        </label>
        <label className="field">{method === "email" ? "Email" : "Tên hoặc mã chi nhánh"}
          <input type={method === "email" ? "email" : "text"} value={maCn} onChange={(e) => setMaCn(e.target.value)}
            placeholder={method === "email" ? "VD: test0003@gmail.com" : "VD: CN03 hoặc Chi nhánh TP.HCM"} autoFocus required />
        </label>
        {method === "email" && <label className="field">Mã chi nhánh (nếu email dùng chung)
          <input value={branchHint} onChange={(e) => setBranchHint(e.target.value)} placeholder="VD: CN01 hoặc CN02" />
          <span className="note">CN01 và CN02 dùng chung email nên cần điền mã chi nhánh này.</span>
        </label>}
        <label className="field">Mật khẩu
          <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)} required />
        </label>
        {snapshot.statusDetail && <span className="note">{snapshot.statusDetail}</span>}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
        <button type="button" className="btn" onClick={() => setForgot(true)}>Quên mật khẩu?</button>
      </form>}
    </LoginScreen>
  );
}

type Filter = "all" | "critical" | "warning" | "unset";
type SupplyFilter = "all" | "waiting" | "none";
type StockSort = "maHang" | "tenHang" | "giaBanLe" | "soLuong" | "muc" | "nguong";

/** Giá trị để sắp xếp bảng tồn kho; "muc" = tồn / ngưỡng, chưa đặt ngưỡng thì xếp cuối. */
const stockSortValue = (i: BranchItem, k: StockSort) =>
  k === "muc" ? (i.nguong > 0 ? i.soLuong / i.nguong : null) : i[k];

/** Ô tìm kiếm của các thanh lọc: khớp không phân biệt hoa thường trên các trường ghép lại. */
const hit = (needle: string, ...fields: (string | number | null | undefined)[]) =>
  !needle || fields.join(" ").toLowerCase().includes(needle);

/** Nhãn hiện cạnh mặt hàng đang chờ công ty (theo yêu cầu còn mở hoặc cảnh báo vừa gửi). */
const SUPPLY: Record<string, [string, string]> = {
  DA_GIAO: ["info", "hàng đang về"],
  DA_DE_XUAT: ["warn", "chờ bạn xác nhận"],
  THIEU_HANG: ["danger", "công ty hết hàng"],
};

const SEC_TONE: Record<string, string> = { HIGH: "danger", MEDIUM: "warn", LOW: "muted" };

/** Sự kiện an ninh client.jar phát hiện trên máy này; mỗi sự kiện cũng được báo lên công ty (SECURITY_REPORT). */
function SecurityTab({ sec }: { sec: ClientSecurityInfo | undefined }) {
  if (!sec) return <Card><Empty>Chưa có dữ liệu giám sát an ninh.</Empty></Card>;
  return (
    <Card title={<>Sự kiện an ninh <span className="muted">· {sec.suKien.length} gần nhất{sec.choGui ? `, ${sec.choGui} chờ gửi lên công ty` : ""}</span></>}>
      <p className="note">
        Ứng dụng cảnh báo khi có truy cập bất thường, thay đổi kết nối hoặc nhận được dữ liệu không hợp lệ.
      </p>
      {sec.suKien.length === 0 ? <Empty>Chưa phát hiện gì bất thường.</Empty> : (
        <div className="table-wrap scroll" style={{ maxHeight: 520 }}>
          <table>
            <thead><tr><th>Thời gian</th><th>Mức</th><th>Mã</th><th>Chi tiết</th></tr></thead>
            <tbody>
              {sec.suKien.map((e, i) => (
                <tr key={`${e.thoiGian}-${i}`}>
                  <td className="muted nowrap">{e.thoiGian}</td>
                  <td><Badge tone={SEC_TONE[e.muc] ?? "muted"}>{e.muc || "—"}</Badge></td>
                  <td className="code">{e.loai}</td>
                  <td style={{ wordBreak: "break-word" }}>{e.chiTiet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Công nợ của chi nhánh với công ty: server đẩy tin DEBT mỗi khi sổ đổi (nhận hàng, phiếu thu, điều chuyển). */
function Debt({ debt }: { debt: BranchDebtInfo | null }) {
  if (!debt) {
    return <Card><Empty>Chưa nhận được công nợ từ server (server cũ chưa hỗ trợ DEBT, hoặc đang chờ kết nối).</Empty></Card>;
  }
  const over = debt.conNo > debt.hanMuc;
  return (
    <>
      {over && (
        <div className="banner banner-danger">
          Còn nợ {fmtMoney(debt.conNo)}, vượt hạn mức {fmtMoney(debt.hanMuc)}. Liên hệ công ty để thanh toán.
        </div>
      )}
      <div className="kpis">
        <Stat label="Tổng tiền hàng đã nhận" value={fmtMoney(debt.tongNhan)} />
        <Stat label="Đã trả" value={fmtMoney(debt.daTra)} tone="success" />
        <Stat label="Còn nợ" value={fmtMoney(debt.conNo)} tone={over ? "danger" : debt.conNo > 0 ? "warn" : "success"}
          hint={debt.conNo > 0 ? `${Math.round((debt.conNo / Math.max(debt.hanMuc, 1)) * 100)}% hạn mức` : "đã trả đủ"} />
        <Stat label="Hạn mức nợ" value={fmtMoney(debt.hanMuc)} />
      </div>
      <Card title={<>{debt.butToan.length} bút toán gần nhất <span className="muted">· cập nhật {debt.capNhat.slice(11)}</span></>}>
        <EntryTable rows={debt.butToan} />
      </Card>
    </>
  );
}

function Stock({ items, requests, reported, online, push }: {
  items: BranchItem[]; requests: BranchRequest[]; reported: string[]; online: boolean; push: Push;
}) {
  const { run } = useAction(push);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort<StockSort>>(null);
  const count =(l: StockLevel) => items.filter((i) => stockLevel(i.soLuong, i.nguong) === l).length;
  const needle = q.trim().toLowerCase();
  const supply = new Map<string, [string, string]>();
  reported.forEach((ma) => supply.set(ma, ["warn", "đã báo công ty"]));
  requests.filter((r) => SUPPLY[r.trangThai]).forEach((r) => supply.set(r.maHang, SUPPLY[r.trangThai]));
  const waiting = items.filter((i) => supply.has(i.maHang)).length;
  // server cũ không gửi danh mục: khi đó ẩn bộ lọc và cột liên quan
  const categories = [...new Set(items.map((i) => i.danhMuc).filter(Boolean))];
  const hasPrice = items.some((i) => i.giaBanLe != null);
  const shown = sortRows(items.filter((i) => (filter === "all" || stockLevel(i.soLuong, i.nguong) === filter)
    && (supplyFilter === "all" || supply.has(i.maHang) === (supplyFilter === "waiting"))
    && (category === "all" || i.danhMuc === category)
    && hit(needle, i.maHang, i.tenHang, i.model)), sort, stockSortValue);
  const th = { sort, onSort: setSort };

  return (
    <div className="listpage">
      <aside className="filters">
        <FilterGroup title="Tìm hàng hóa">
          <input type="search" placeholder="Mã, tên hoặc model" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Tìm mặt hàng" />
        </FilterGroup>
        {categories.length > 0 && (
          <FilterGroup title="Danh mục">
            <Facet<string> name="category" value={category} onChange={setCategory} options={[
              { id: "all", label: "Tất cả", count: items.length },
              ...categories.map((c) => ({ id: c, label: c, count: items.filter((i) => i.danhMuc === c).length })),
            ]} />
          </FilterGroup>
        )}
        <FilterGroup title="Mức tồn">
          <Facet<Filter> name="level" value={filter} onChange={setFilter} options={[
            { id: "all", label: "Tất cả", count: items.length },
            { id: "critical", label: "Dưới ngưỡng", count: count("critical") },
            { id: "warning", label: "Sắp chạm ngưỡng", count: count("warning") },
            { id: "unset", label: "Chưa đặt ngưỡng", count: count("unset") },
          ]} />
        </FilterGroup>
        <FilterGroup title="Nhập hàng">
          <Facet<SupplyFilter> name="supply" value={supplyFilter} onChange={setSupplyFilter} options={[
            { id: "all", label: "Tất cả", count: items.length },
            { id: "waiting", label: "Đang chờ công ty", count: waiting },
            { id: "none", label: "Không chờ", count: items.length - waiting },
          ]} />
        </FilterGroup>
        <FilterGroup title="Ghi chú">
          <p className="note" style={{ margin: 0 }}>
            Sau mỗi lần bán, nếu tồn &lt; ngưỡng thì ứng dụng tự gửi LOW_STOCK lên công ty.
            Mặt hàng chưa đặt ngưỡng sẽ không được cảnh báo.
          </p>
        </FilterGroup>
      </aside>
      <section className="card">
        <div className="card-head">
          <h2>Tồn kho tại chi nhánh <span className="muted">· {shown.length} mặt hàng</span></h2>
          <button className="btn btn-sm" disabled={!online} onClick={() => run(() => api("/api/inventory/refresh", {}))}>
            Tải lại
          </button>
        </div>
        {shown.length === 0 ? <Empty>{items.length ? "Không có mặt hàng nào khớp bộ lọc." : "Chưa có dữ liệu tồn kho."}</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh k="maHang" {...th}>Mã hàng</SortTh><SortTh k="tenHang" {...th}>Tên hàng</SortTh>
                  {hasPrice && <SortTh k="giaBanLe" num {...th}>Giá bán lẻ</SortTh>}
                  <SortTh k="soLuong" num {...th}>Tồn</SortTh><SortTh k="muc" {...th}>Mức tồn</SortTh><th>Bán hàng</th>
                  <SortTh k="nguong" {...th}>Ngưỡng tối thiểu</SortTh>
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <StockRow key={it.maHang} it={it} online={online} push={push} supply={supply.get(it.maHang)}
                    showPrice={hasPrice} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StockRow({ it, online, push, supply, showPrice }: {
  it: BranchItem; online: boolean; push: Push; supply?: [string, string]; showPrice: boolean;
}) {
  const [qty, setQty] = useState("");
  const [nguong, setNguong] = useState(String(it.nguong));
  const { run, busy } = useAction(push);
  const level = stockLevel(it.soLuong, it.nguong);
  const sell = (n: number) => run(() => api("/api/sale", { maHang: it.maHang, soLuong: n }));

  useEffect(() => setNguong(String(it.nguong)), [it.nguong]);

  return (
    <tr className={level === "critical" ? "low" : ""}>
      <td className="code">{it.maHang}</td>
      <td>
        <div className="with-thumb">
          <ProductImage src={it.anh} alt={it.tenHang} category={it.danhMuc} />
          <div>
            {it.tenHang}
            {supply && <> <Badge tone={supply[0]}>{supply[1]}</Badge></>}
            {(it.model || it.danhMuc) && (
              <div className="muted" style={{ fontSize: 12 }}>{[it.model, it.danhMuc].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        </div>
      </td>
      {showPrice && <td className="num nowrap">{fmtMoney(it.giaBanLe)}</td>}
      <td className="num"><b style={{ fontSize: 14 }}>{fmtNumber(it.soLuong)}</b></td>
      <td>
        <StockBar soLuong={it.soLuong} nguong={it.nguong} />
        <div className="muted" style={{ fontSize: 12 }}>{LEVEL_LABEL[level]}</div>
      </td>
      <td className="nowrap">
        <span className="qty-group">
          <button className="btn btn-sm btn-quick" disabled={!online || busy || it.soLuong < 1} onClick={() => sell(1)}>−1</button>
          <button className="btn btn-sm btn-quick" disabled={!online || busy || it.soLuong < 5} onClick={() => sell(5)}>−5</button>
          <input type="number" min={1} placeholder="SL" value={qty} style={{ height: 26 }}
            onChange={(e) => setQty(e.target.value)} aria-label={`Số lượng bán ${it.maHang}`} />
          <button className="btn btn-sm btn-primary" disabled={!online || busy || !(Number(qty) > 0)}
            onClick={async () => { if (await sell(Number(qty))) setQty(""); }}>Bán</button>
        </span>
      </td>
      <td className="nowrap">
        <span className="qty-group">
          <input type="number" min={0} value={nguong} style={{ height: 26 }} onChange={(e) => setNguong(e.target.value)}
            aria-label={`Ngưỡng ${it.maHang}`} />
          <button className="btn btn-sm" disabled={!online || busy || nguong === String(it.nguong) || Number(nguong) < 0}
            onClick={() => run(() => api("/api/threshold", { maHang: it.maHang, nguong: Number(nguong) }),
              `Đã đặt ngưỡng ${it.maHang} = ${nguong}`)}>Lưu</button>
        </span>
      </td>
    </tr>
  );
}

function Offers({ requests, items, online, push }: {
  requests: BranchRequest[]; items: BranchItem[]; online: boolean; push: Push;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const name = (ma: string) => items.find((i) => i.maHang === ma)?.tenHang ?? ma;
  const needle = q.trim().toLowerCase();
  const shown = requests.filter((r) => (!state || r.trangThai === state) && hit(needle, `yc${r.maYc}`, r.maHang, name(r.maHang)));
  // hàng đã gửi lên đầu: việc cần làm nhất là bấm "Đã nhận hàng"
  const open = shown.filter((r) => !["HOAN_TAT", "TU_CHOI"].includes(r.trangThai))
    .sort((a, b) => Number(b.trangThai === "DA_GIAO") - Number(a.trangThai === "DA_GIAO") || b.maYc - a.maYc);
  const closed = shown.filter((r) => ["HOAN_TAT", "TU_CHOI"].includes(r.trangThai));
  const filtering = q !== "" || state !== "";
  return (
    <>
      <FilterBar active={filtering} onClear={() => { setQ(""); setState(""); }}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Mã YC, mã hoặc tên hàng" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Trạng thái
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Tất cả</option>
            {["DA_DE_XUAT", "THIEU_HANG", "DA_GIAO", "HOAN_TAT", "TU_CHOI"].map((st) => (
              <option key={st} value={st}>{STATE_LABEL[st]}</option>
            ))}
          </select>
        </label>
      </FilterBar>
      <div className="grid">
        <Card title={<>Hàng về và đề xuất cần xử lý <span className="muted">· {open.length} yêu cầu</span></>}>
          {open.length === 0 ? <Empty>{filtering ? "Không có yêu cầu nào khớp bộ lọc." : "Không có đề xuất nào đang chờ."}</Empty> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Mã YC</th><th>Mặt hàng</th><th>Trạng thái</th><th>Nội dung</th><th className="num">Số lượng nhận</th><th /></tr>
                </thead>
                <tbody>
                  {open.map((r) => <OfferRow key={r.maYc} r={r} name={name(r.maHang)} online={online} push={push} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {closed.length > 0 && (
          <Card title="Đã xử lý gần đây">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Mã YC</th><th>Mặt hàng</th><th className="num">Đã gửi</th><th className="num">Thực nhận</th><th>Chênh lệch</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
                <tbody>
                  {closed.map((r) => (
                    <tr key={r.maYc}>
                      <td className="code">YC{r.maYc}</td>
                      <td>{name(r.maHang)}</td>
                      <td className="num">{r.soLuongGiao != null ? fmtNumber(r.soLuongGiao) : fmtNumber(r.soLuongDeXuat)}</td>
                      <td className="num">{fmtNumber(r.soLuongNhan)}</td>
                      <td>{r.soLuongNhan == null ? "—" : r.soLuongNhan === r.soLuongGiao ? "Đủ hàng" : `${r.soLuongNhan > (r.soLuongGiao ?? 0) ? "Thừa" : "Thiếu"} ${Math.abs(r.soLuongNhan - (r.soLuongGiao ?? 0))}`}</td>
                      <td><StateBadge state={r.trangThai} /></td>
                      <td className="muted nowrap">{r.capNhat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function OfferRow({ r, name, online, push }: { r: BranchRequest; name: string; online: boolean; push: Push }) {
  const initial = r.trangThai === "DA_GIAO" ? "" : r.trangThai === "THIEU_HANG" ? r.soLuongCoThe : r.soLuongDeXuat;
  const [qty, setQty] = useState(String(initial ?? ""));
  const { run, busy } = useAction(push);
  const n = Number(qty);
  const validReceipt = qty.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 2147483647;
  const delta = n - (r.soLuongGiao ?? 0);
  const off = !online || busy;

  useEffect(() => setQty(String(initial ?? "")), [initial]);

  const accept = () => run(() => api(`/api/requests/${r.maYc}/accept`, { soLuong: n }));
  const reject = () => run(() => api(`/api/requests/${r.maYc}/reject`, {}), `Đã từ chối YC #${r.maYc}`);
  const received = () => {
    if (!validReceipt) return;
    if (delta !== 0 && !window.confirm(`YC #${r.maYc}: đã gửi ${r.soLuongGiao}, thực nhận ${n} (${delta > 0 ? "thừa" : "thiếu"} ${Math.abs(delta)}). Xác nhận nhập kho và báo công ty?`)) return;
    run(() => api(`/api/requests/${r.maYc}/received`, { soLuongNhan: n }), "Đã gửi số kiểm đếm, chờ server xác nhận.");
  };

  return (
    <tr className={r.trangThai === "THIEU_HANG" ? "warn" : ""}>
      <td className="code">YC{r.maYc}</td>
      <td>{name}</td>
      <td><StateBadge state={r.trangThai} /></td>
      <td>
        {r.trangThai === "DA_DE_XUAT" && <>Công ty đề xuất cấp <b>{fmtNumber(r.soLuongDeXuat)}</b>. Đồng ý, sửa số lượng hoặc từ chối.</>}
        {r.trangThai === "THIEU_HANG" && <>Công ty báo không đủ hàng, kho tổng chỉ còn <b>{fmtNumber(r.soLuongCoThe)}</b>.
          Nhận số đó, chờ điều chuyển từ chi nhánh khác, hoặc từ chối.</>}
        {r.trangThai === "DA_GIAO" && <>Công ty đã gửi <b>{fmtNumber(r.soLuongGiao)}</b>. Nhập số thực tế đã kiểm đếm (kể cả 0 nếu thiếu toàn bộ).</>}
        <div className="muted" style={{ fontSize: 12 }}>{r.capNhat}</div>
      </td>
      {r.trangThai === "DA_GIAO" ? (
        <>
          <td className="num">
            <input type="number" min={0} max={2147483647} step={1} value={qty} placeholder="Thực nhận"
              aria-label={`Số lượng thực nhận YC ${r.maYc}`} disabled={off} onChange={(e) => setQty(e.target.value)} />
            {validReceipt && <div className={delta === 0 ? "muted" : "badge badge-danger"} style={{ fontSize: 12 }}>
              {delta === 0 ? "Đủ hàng" : `${delta > 0 ? "Thừa" : "Thiếu"} ${Math.abs(delta)} — sẽ báo công ty`}
            </div>}
          </td>
          <td className="right nowrap"><button className="btn btn-sm btn-success" disabled={off || !validReceipt} onClick={received}>Xác nhận thực nhận</button></td>
        </>
      ) : (
        <>
          <td className="num">
            <input type="number" min={1} value={qty} style={{ height: 26 }} onChange={(e) => setQty(e.target.value)} aria-label="Số lượng nhận" />
          </td>
          <td className="right nowrap">
            <button className="btn btn-sm btn-primary" disabled={off || !(n > 0)} onClick={accept}>
              {n === r.soLuongDeXuat ? "Đồng ý" : "Đồng ý số này"}
            </button>{" "}
            <button className="btn btn-sm btn-danger" disabled={off} onClick={reject}>Từ chối</button>
          </td>
        </>
      )}
    </tr>
  );
}

function TransferList({ transfers, online, push }: { transfers: BranchTransfer[]; online: boolean; push: Push }) {
  const { run, busy } = useAction(push);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = transfers.filter((t) => (!state || t.trangThai === state) && hit(needle, `dc${t.maDc}`, t.maHang, t.chiNhanhNhan));
  const filtering = q !== "" || state !== "";
  return (
    <>
      <FilterBar active={filtering} onClear={() => { setQ(""); setState(""); }}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Mã phiếu, mã hàng, chi nhánh nhận" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Trạng thái
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(TRANSFER_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </FilterBar>
      <Card title="Phiếu điều chuyển sang chi nhánh khác">
        <p className="note">
          Khi kho tổng thiếu, công ty có thể xin chuyển bớt hàng dư của chi nhánh này cho chi nhánh đang thiếu.
        </p>
        {shown.length === 0 ? <Empty>{filtering ? "Không có phiếu nào khớp bộ lọc." : "Không có yêu cầu điều chuyển."}</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mã phiếu</th><th>Mặt hàng</th><th className="num">Số lượng</th><th>Chi nhánh nhận</th><th>Cập nhật</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.maDc} className={t.trangThai === "CHO" ? "warn" : ""}>
                    <td className="code">DC{t.maDc}</td>
                    <td>{t.maHang}</td>
                    <td className="num">{fmtNumber(t.soLuong)}</td>
                    <td>{t.chiNhanhNhan}</td>
                    <td className="muted nowrap">{t.capNhat}</td>
                    <td className="right nowrap">
                      {t.trangThai === "CHO" ? (
                        <>
                          <button className="btn btn-sm btn-primary" disabled={!online || busy}
                            onClick={() => run(() => api(`/api/transfers/${t.maDc}/accept`, {}))}>Đồng ý chuyển</button>{" "}
                          <button className="btn btn-sm btn-danger" disabled={!online || busy}
                            onClick={() => run(() => api(`/api/transfers/${t.maDc}/reject`, {}))}>Từ chối</button>
                        </>
                      ) : <StateBadge state={t.trangThai} transfer />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function News({ items, inbox, inventory, online, push }: {
  items: Notice[]; inbox: InboxItem[]; inventory: BranchItem[]; online: boolean; push: Push;
}) {
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [only, setOnly] = useState<"" | "action">("");
  const needle = q.trim().toLowerCase();
  const filtering = q !== "" || day !== "" || only !== "";
  const shownInbox = inbox.filter((n) => (!day || n.taoLuc.startsWith(day)) && hit(needle, n.tieuDe, n.noiDung, n.maSp)
    && (!only || waiting(n)));
  const shown = only ? [] : items.filter((n) => (!day || n.time.startsWith(day)) && hit(needle, n.text));

  // mở hộp thư = đã xem: báo server một lần cho mỗi thông báo chưa xem
  const unseen = inbox.filter((n) => n.trangThai === "DA_GUI").map((n) => n.id).join(",");
  useEffect(() => {
    if (!online || !unseen) return;
    // tuần tự, cách nhau 50 ms: không vượt giới hạn tần suất API cục bộ của client.jar (CLIENT_API_FLOOD)
    let stop = false;
    (async () => {
      for (const id of unseen.split(",")) {
        if (stop) return;
        await api(`/api/inbox/${id}/reply`, { traLoi: "XEM" }).catch(() => {});
        await new Promise((r) => setTimeout(r, 50));
      }
    })();
    return () => { stop = true; };
  }, [unseen, online]);

  return (
    <>
      <FilterBar active={filtering} onClear={() => { setQ(""); setDay(""); setOnly(""); }}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Tiêu đề, nội dung, mã hàng" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Ngày
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="row" style={{ alignSelf: "end" }}>
          <input type="checkbox" checked={only === "action"} onChange={(e) => setOnly(e.target.checked ? "action" : "")} />
          Chỉ thông báo chờ trả lời
        </label>
      </FilterBar>
      <Card title={<>Hộp thư thông báo <span className="muted">· {shownInbox.length + shown.length}</span></>}>
        {shownInbox.length + shown.length === 0
          ? <Empty>{filtering ? "Không có thông báo nào khớp bộ lọc." : "Chưa có thông báo."}</Empty> : (
          <div className="list" style={{ maxWidth: 860 }}>
            {shownInbox.map((n) => (
              <InboxCard key={n.id} n={n} item={inventory.find((i) => i.maHang === n.maSp)} online={online} push={push} />
            ))}
            {shown.map((n, i) => (
              <div key={"b" + i}>
                <div className="muted" style={{ fontSize: 12 }}>Công ty · {n.time}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/** Thông báo còn chờ chi nhánh trả lời (Hỏi nhu cầu / Sản phẩm mới chưa trả lời). */
function waiting(n: InboxItem): boolean {
  return n.loai !== "TIN" && (n.trangThai === "DA_GUI" || n.trangThai === "DA_XEM");
}

const NOTICE_TYPE_TONE: Record<string, string> = { TIN: "muted", HOI_NHU_CAU: "warn", SP_MOI: "info" };

function InboxCard({ n, item, online, push }: { n: InboxItem; item: BranchItem | undefined; online: boolean; push: Push }) {
  const [qty, setQty] = useState(String(n.deXuat ?? ""));
  useEffect(() => setQty(String(n.deXuat ?? "")), [n.deXuat]);
  const { run, busy } = useAction(push);
  const num = Number(qty);
  const yes = n.loai === "HOI_NHU_CAU" ? "CAN_HANG" : "MUON_NHAP";
  const no = n.loai === "HOI_NHU_CAU" ? "KHONG_CAN" : "BO_QUA";
  const reply = (traLoi: string) => run(() => api(`/api/inbox/${n.id}/reply`, { traLoi, soLuong: traLoi === yes ? num : 0 }),
    traLoi === yes ? `Đã gửi: ${NOTICE_STATE_LABEL[yes].toLowerCase()} ${num} ${item?.tenHang ?? n.maSp}. Công ty sẽ duyệt và gửi hàng.`
      : "Đã trả lời công ty");

  return (
    <div className={n.trangThai === "DA_GUI" ? "inbox-unread" : ""}>
      <div className="row muted" style={{ fontSize: 12, gap: 6 }}>
        <Badge tone={NOTICE_TYPE_TONE[n.loai]}>{NOTICE_TYPE_LABEL[n.loai]}</Badge>
        <span>Công ty · {n.taoLuc}</span>
        {n.loai !== "TIN" && n.trangThai !== "DA_GUI" && n.trangThai !== "DA_XEM" && (
          <Badge tone={NOTICE_STATE_TONE[n.trangThai]}>
            {NOTICE_STATE_LABEL[n.trangThai]}{n.soLuong ? ` ${fmtNumber(n.soLuong)}` : ""}{n.maYc ? ` · YC${n.maYc}` : ""}
          </Badge>
        )}
      </div>
      <div className="with-thumb" style={{ alignItems: "flex-start", marginTop: 4 }}>
        {n.maSp && <ProductImage src={n.anh || item?.anh} alt={item?.tenHang ?? n.maSp} category={item?.danhMuc} size={64} />}
        <div style={{ flex: 1 }}>
          <b>{n.tieuDe}</b>
          {n.noiDung && <div style={{ whiteSpace: "pre-wrap" }}>{n.noiDung}</div>}
          {n.maSp && (
            <div className="muted" style={{ fontSize: 12 }}>
              {n.maSp} · {item?.tenHang ?? "mặt hàng mới"}
              {item && <> · tồn {fmtNumber(item.soLuong)}{item.nguong ? ` / ngưỡng ${fmtNumber(item.nguong)}` : ""}</>}
              {item?.giaXuat != null && <> · giá nhập từ công ty {fmtMoney(item.giaXuat)}</>}
            </div>
          )}
          {waiting(n) && (
            <div className="row" style={{ marginTop: 6 }}>
              <input type="number" min={1} max={1000} value={qty} placeholder="Số lượng" style={{ width: 90, height: 28 }}
                aria-label="Số lượng cần" onChange={(e) => setQty(e.target.value)} />
              <button className="btn btn-sm btn-success" disabled={!online || busy || !(num > 0 && num <= 1000)} onClick={() => reply(yes)}>
                {n.loai === "HOI_NHU_CAU" ? "Cần hàng" : "Muốn nhập"}
              </button>
              <button className="btn btn-sm" disabled={!online || busy} onClick={() => reply(no)}>
                {n.loai === "HOI_NHU_CAU" ? "Không cần" : "Bỏ qua"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function History({ s, online, push }: { s: BranchSnapshot; online: boolean; push: Push }) {
  const [tu, setTu] = useState(today(-30));
  const [den, setDen] = useState(today());
  const { run, busy } = useAction(push);
  const [q, setQ] = useState("");
  const [nguon, setNguon] = useState<"" | "KHO_TONG" | "DIEU_CHUYEN">("");
  const needle = q.trim().toLowerCase();
  const shown = s.history.filter((h) => (!nguon || (h.nguon === "KHO_TONG") === (nguon === "KHO_TONG"))
    && hit(needle, `yc${h.maYc}`, h.maHang, h.tenHang, h.nguon));
  const total = shown.reduce((a, h) => a + h.soLuong, 0);
  const filtering = q !== "" || nguon !== "";

  return (
    <>
      <FilterBar active={filtering} onClear={() => { setQ(""); setNguon(""); }}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Mã YC, mã hoặc tên hàng, chi nhánh chuyển" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Nguồn
          <select value={nguon} onChange={(e) => setNguon(e.target.value as typeof nguon)}>
            <option value="">Tất cả</option>
            <option value="KHO_TONG">Kho tổng</option>
            <option value="DIEU_CHUYEN">Điều chuyển từ chi nhánh</option>
          </select>
        </label>
      </FilterBar>
      <Card title="Phiếu nhập hàng" actions={
        <>
          <span className="muted">Từ</span>
          <input type="date" value={tu} onChange={(e) => setTu(e.target.value)} aria-label="Từ ngày" />
          <span className="muted">đến</span>
          <input type="date" value={den} onChange={(e) => setDen(e.target.value)} aria-label="Đến ngày" />
          <button className="btn btn-primary" disabled={!online || busy}
            onClick={() => run(() => api("/api/history", { tu, den }))}>Xem</button>
        </>
      }>
        {s.history.length === 0 ? <Empty>Chọn khoảng ngày rồi bấm Xem.</Empty>
          : shown.length === 0 ? <Empty>Không có phiếu nào khớp bộ lọc.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Thời gian</th><th>Mã YC</th><th>Mã hàng</th><th>Tên hàng</th><th className="num">Đã gửi</th><th className="num">Thực nhận</th><th>Chênh lệch</th><th>Nguồn</th></tr></thead>
              <tbody>
                {shown.map((h, i) => (
                  <tr key={i}>
                    <td className="nowrap">{h.thoiGian}</td>
                    <td className="code">YC{h.maYc}</td>
                    <td>{h.maHang}</td>
                    <td>{h.tenHang}</td>
                    <td className="num">{fmtNumber(h.soLuong)}</td>
                    <td className="num">{fmtNumber(h.soLuongNhan)}</td>
                    <td>{h.soLuongNhan == null ? "Chưa ghi nhận" : h.soLuongNhan === h.soLuong ? "Đủ hàng" :
                      <Badge tone="danger">{h.soLuongNhan > h.soLuong ? "Thừa" : "Thiếu"} {Math.abs(h.soLuongNhan - h.soLuong)}</Badge>}</td>
                    <td>{h.nguon === "KHO_TONG" ? "Kho tổng" : <Badge tone="info">Điều chuyển từ {h.nguon}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.historyRange && (
              <div className="table-foot">
                Khoảng {s.historyRange}: {filtering ? `${shown.length}/${s.history.length}` : s.history.length} phiếu,
                tổng đã gửi {fmtNumber(total)}, thực nhận đã kiểm đếm {fmtNumber(shown.reduce((sum, h) => sum + (h.soLuongNhan ?? 0), 0))}.
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function Activity({ notices }: { notices: Notice[] }) {
  const tone: Record<string, string> = { error: "danger", warn: "warn", success: "success", offer: "warn", info: "info" };
  const label: Record<string, string> = { error: "Lỗi", warn: "Cảnh báo", success: "Thành công", offer: "Đề xuất", info: "Thông tin" };
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = notices.filter((n) => (!level || n.level === level) && hit(needle, n.text));
  const filtering = q !== "" || level !== "";
  return (
    <>
      <FilterBar active={filtering} onClear={() => { setQ(""); setLevel(""); }}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Nội dung" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">Loại
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(label).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
      </FilterBar>
      <Card title={<>Hoạt động trong phiên làm việc <span className="muted">· {filtering ? `${shown.length}/${notices.length}` : notices.length}</span></>}>
        {shown.length === 0 ? <Empty>{filtering ? "Không có hoạt động nào khớp bộ lọc." : "Chưa có hoạt động."}</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Giờ</th><th>Loại</th><th>Nội dung</th></tr></thead>
              <tbody>
                {shown.map((n, i) => (
                  <tr key={i}>
                    <td className="muted nowrap">{n.time.slice(11)}</td>
                    <td><Badge tone={tone[n.level] ?? "muted"}>{label[n.level] ?? n.level}</Badge></td>
                    <td>{n.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
