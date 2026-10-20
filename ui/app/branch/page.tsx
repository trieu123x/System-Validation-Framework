"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, fmtNumber, today, useEvents } from "@/lib/api";
import type { BranchItem, BranchRequest, BranchSnapshot, BranchTransfer, Notice } from "@/lib/types";
import {
  Badge, Card, Dot, Empty, Facet, FilterGroup, LEVEL_LABEL, Shell, StateBadge, StockBar, stockLevel, Toasts, useAction,
  useToasts, type StockLevel,
} from "@/components/ui";
import { LoginScreen } from "@/components/Login";

type Tab = "stock" | "offers" | "transfers" | "news" | "history" | "activity";
type Push = (level: string, text: string) => void;

const STATUS_TEXT: Record<BranchSnapshot["status"], string> = {
  ONLINE: "Đã kết nối",
  CONNECTED: "Đã nối, chưa đăng nhập",
  CONNECTING: "Đang kết nối...",
  DISCONNECTED: "Mất kết nối",
};

export default function BranchPage() {
  const [s, setS] = useState<BranchSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("stock");
  const { toasts, push, dismiss } = useToasts();

  const agentUp = useEvents({
    state: (snap: BranchSnapshot) => setS(snap),
    toast: (n: Notice) => push(n.level, n.text),
  });

  useEffect(() => {
    api<BranchSnapshot>("/api/state").then(setS).catch(() => {});
  }, []);

  if (!s) {
    return <main className="center"><p className="muted">Đang mở ứng dụng chi nhánh...</p></main>;
  }
  if (!s.maCn) {
    return (
      <>
        <Login snapshot={s} agentUp={agentUp} />
        <Toasts toasts={toasts} dismiss={dismiss} />
      </>
    );
  }

  const online = s.status === "ONLINE";
  const actionable = s.requests.filter((r) => ["DA_DE_XUAT", "THIEU_HANG", "DA_GIAO"].includes(r.trangThai)).length;
  const pendingTransfers = s.transfers.filter((t) => t.trangThai === "CHO").length;
  const low = s.inventory.filter((i) => stockLevel(i.soLuong, i.nguong) === "critical").length;

  const TITLES: Record<Tab, string> = {
    stock: "Bán hàng & tồn kho", offers: "Nhận hàng từ công ty", transfers: "Yêu cầu điều chuyển hàng",
    news: "Thông báo từ công ty", history: "Lịch sử nhập hàng", activity: "Nhật ký hoạt động",
  };

  return (
    <>
      <Shell<Tab> brand={s.tenCn ?? ""} sub={`${s.maCn} · server ${s.server || "—"}`} value={tab} onChange={setTab}
        title={TITLES[tab]}
        nav={[
          { id: "stock", label: "Bán hàng", count: low, tone: "danger" },
          { id: "offers", label: "Nhận hàng", count: actionable, tone: "warn" },
          { id: "transfers", label: "Điều chuyển", count: pendingTransfers, tone: "warn" },
          { id: "news", label: "Thông báo" },
          { id: "history", label: "Lịch sử nhập" },
          { id: "activity", label: "Nhật ký" },
        ]}
        status={
          <>
            <span title={s.statusDetail}><Dot on={online} />{STATUS_TEXT[s.status]}</span>
            <button className="btn btn-sm" onClick={() => api("/api/logout", {}).catch(() => {})}>Đăng xuất</button>
          </>
        }>
        {!agentUp && <div className="banner banner-danger">Không liên lạc được với client.jar trên máy này.</div>}
        {agentUp && !online && (
          <div className="banner banner-warn">
            {s.statusDetail}. Dữ liệu bên dưới là bản cuối cùng nhận được; thao tác sẽ mở lại khi nối lại được server.
          </div>
        )}
        {tab === "stock" && <Stock items={s.inventory} requests={s.requests} reported={s.daBao ?? []} online={online} push={push} />}
        {tab === "offers" && <Offers requests={s.requests} items={s.inventory} online={online} push={push} />}
        {tab === "transfers" && <TransferList transfers={s.transfers} online={online} push={push} />}
        {tab === "news" && <News items={s.broadcasts} />}
        {tab === "history" && <History s={s} online={online} push={push} />}
        {tab === "activity" && <Activity notices={s.notices} />}
      </Shell>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </>
  );
}

function Login({ snapshot, agentUp }: { snapshot: BranchSnapshot; agentUp: boolean }) {
  const [maCn, setMaCn] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [server, setServer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ server: string }>("/api/config").then((c) => setServer(c.server)).catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { maCn: maCn.trim().toUpperCase(), matKhau, server });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LoginScreen side="branch">
      <form className="form-stack" onSubmit={submit}>
        <label className="field">Mã chi nhánh
          <input value={maCn} onChange={(e) => setMaCn(e.target.value)} placeholder="VD: CN01" autoFocus required />
        </label>
        <label className="field">Mật khẩu
          <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)} required />
        </label>
        <label className="field">Địa chỉ server
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="auto hoặc 192.168.1.10:5000" />
        </label>
        <span className="note">
          Để “auto” thì máy tự tìm server trong mạng LAN (UDP broadcast).
          {snapshot.statusDetail && <> Trạng thái: {snapshot.statusDetail}</>}
        </span>
        {error && <p className="error">{error}</p>}
        {!agentUp && <p className="error">Không liên lạc được với client.jar.</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      </form>
    </LoginScreen>
  );
}

type Filter = "all" | "critical" | "warning" | "unset";

/** Nhãn hiện cạnh mặt hàng đang chờ công ty (theo yêu cầu còn mở hoặc cảnh báo vừa gửi). */
const SUPPLY: Record<string, [string, string]> = {
  DA_GIAO: ["info", "hàng đang về"],
  DA_DE_XUAT: ["warn", "chờ bạn xác nhận"],
  THIEU_HANG: ["danger", "công ty hết hàng"],
};

function Stock({ items, requests, reported, online, push }: {
  items: BranchItem[]; requests: BranchRequest[]; reported: string[]; online: boolean; push: Push;
}) {
  const { run } = useAction(push);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const count = (l: StockLevel) => items.filter((i) => stockLevel(i.soLuong, i.nguong) === l).length;
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (filter === "all" || stockLevel(i.soLuong, i.nguong) === filter)
    && (!needle || `${i.maHang} ${i.tenHang}`.toLowerCase().includes(needle)));
  const supply = new Map<string, [string, string]>();
  reported.forEach((ma) => supply.set(ma, ["warn", "đã báo công ty"]));
  requests.filter((r) => SUPPLY[r.trangThai]).forEach((r) => supply.set(r.maHang, SUPPLY[r.trangThai]));

  return (
    <div className="listpage">
      <aside className="filters">
        <FilterGroup title="Tìm hàng hóa">
          <input type="search" placeholder="Mã hoặc tên hàng" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Tìm mặt hàng" />
        </FilterGroup>
        <FilterGroup title="Mức tồn">
          <Facet<Filter> name="level" value={filter} onChange={setFilter} options={[
            { id: "all", label: "Tất cả", count: items.length },
            { id: "critical", label: "Dưới ngưỡng", count: count("critical") },
            { id: "warning", label: "Sắp chạm ngưỡng", count: count("warning") },
            { id: "unset", label: "Chưa đặt ngưỡng", count: count("unset") },
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
                <tr><th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th>Mức tồn</th><th>Bán hàng</th><th>Ngưỡng tối thiểu</th></tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <StockRow key={it.maHang} it={it} online={online} push={push} supply={supply.get(it.maHang)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StockRow({ it, online, push, supply }: {
  it: BranchItem; online: boolean; push: Push; supply?: [string, string];
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
        {it.tenHang}
        {supply && <> <Badge tone={supply[0]}>{supply[1]}</Badge></>}
      </td>
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
  const name = (ma: string) => items.find((i) => i.maHang === ma)?.tenHang ?? ma;
  // hàng đã gửi lên đầu: việc cần làm nhất là bấm "Đã nhận hàng"
  const open = requests.filter((r) => !["HOAN_TAT", "TU_CHOI"].includes(r.trangThai))
    .sort((a, b) => Number(b.trangThai === "DA_GIAO") - Number(a.trangThai === "DA_GIAO") || b.maYc - a.maYc);
  const closed = requests.filter((r) => ["HOAN_TAT", "TU_CHOI"].includes(r.trangThai));
  return (
    <div className="grid">
      <Card title={<>Hàng về và đề xuất cần xử lý <span className="muted">· {open.length} yêu cầu</span></>}>
        {open.length === 0 ? <Empty>Không có đề xuất nào đang chờ.</Empty> : (
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
        <Card title="Đã xử lý trong phiên này">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mã YC</th><th>Mặt hàng</th><th className="num">Số lượng</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {closed.map((r) => (
                  <tr key={r.maYc}>
                    <td className="code">YC{r.maYc}</td>
                    <td>{name(r.maHang)}</td>
                    <td className="num">{r.soLuongGiao != null ? fmtNumber(r.soLuongGiao) : fmtNumber(r.soLuongDeXuat)}</td>
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
  );
}

function OfferRow({ r, name, online, push }: { r: BranchRequest; name: string; online: boolean; push: Push }) {
  const initial = r.trangThai === "THIEU_HANG" ? r.soLuongCoThe : r.soLuongDeXuat;
  const [qty, setQty] = useState(String(initial ?? ""));
  const { run, busy } = useAction(push);
  const n = Number(qty);
  const off = !online || busy;

  useEffect(() => setQty(String(initial ?? "")), [initial]);

  const accept = () => run(() => api(`/api/requests/${r.maYc}/accept`, { soLuong: n }));
  const reject = () => run(() => api(`/api/requests/${r.maYc}/reject`, {}), `Đã từ chối YC #${r.maYc}`);
  const received = () => run(() => api(`/api/requests/${r.maYc}/received`, {}), `Đã nhập kho YC #${r.maYc}`);

  return (
    <tr className={r.trangThai === "THIEU_HANG" ? "warn" : ""}>
      <td className="code">YC{r.maYc}</td>
      <td>{name}</td>
      <td><StateBadge state={r.trangThai} /></td>
      <td>
        {r.trangThai === "DA_DE_XUAT" && <>Công ty đề xuất cấp <b>{fmtNumber(r.soLuongDeXuat)}</b>. Đồng ý, sửa số lượng hoặc từ chối.</>}
        {r.trangThai === "THIEU_HANG" && <>Công ty báo không đủ hàng, kho tổng chỉ còn <b>{fmtNumber(r.soLuongCoThe)}</b>.
          Nhận số đó, chờ điều chuyển từ chi nhánh khác, hoặc từ chối.</>}
        {r.trangThai === "DA_GIAO" && <>Công ty đã gửi <b>{fmtNumber(r.soLuongGiao)}</b>. Bấm khi hàng tới để cộng vào kho.</>}
        <div className="muted" style={{ fontSize: 12 }}>{r.capNhat}</div>
      </td>
      {r.trangThai === "DA_GIAO" ? (
        <>
          <td className="num">{fmtNumber(r.soLuongGiao)}</td>
          <td className="right nowrap"><button className="btn btn-sm btn-success" disabled={off} onClick={received}>Đã nhận hàng</button></td>
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
  return (
    <Card title="Phiếu điều chuyển sang chi nhánh khác">
      <p className="note">
        Khi kho tổng thiếu, công ty có thể xin chuyển bớt hàng dư của chi nhánh này cho chi nhánh đang thiếu.
      </p>
      {transfers.length === 0 ? <Empty>Không có yêu cầu điều chuyển.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Mã phiếu</th><th>Mặt hàng</th><th className="num">Số lượng</th><th>Chi nhánh nhận</th><th>Cập nhật</th><th /></tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
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
  );
}

function News({ items }: { items: Notice[] }) {
  return (
    <Card title={<>Hộp thư thông báo <span className="muted">· {items.length}</span></>}>
      {items.length === 0 ? <Empty>Chưa có thông báo.</Empty> : (
        <div className="list" style={{ maxWidth: 820 }}>
          {items.map((n, i) => (
            <div key={i}>
              <div className="muted" style={{ fontSize: 12 }}>Công ty · {n.time}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function History({ s, online, push }: { s: BranchSnapshot; online: boolean; push: Push }) {
  const [tu, setTu] = useState(today(-30));
  const [den, setDen] = useState(today());
  const { run, busy } = useAction(push);
  const total = s.history.reduce((a, h) => a + h.soLuong, 0);

  return (
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
      {s.history.length === 0 ? <Empty>Chọn khoảng ngày rồi bấm Xem.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Thời gian</th><th>Mã YC</th><th>Mã hàng</th><th>Tên hàng</th><th className="num">Số lượng</th><th>Nguồn</th></tr></thead>
            <tbody>
              {s.history.map((h, i) => (
                <tr key={i}>
                  <td className="nowrap">{h.thoiGian}</td>
                  <td className="code">YC{h.maYc}</td>
                  <td>{h.maHang}</td>
                  <td>{h.tenHang}</td>
                  <td className="num">{fmtNumber(h.soLuong)}</td>
                  <td>{h.nguon === "KHO_TONG" ? "Kho tổng" : <Badge tone="info">Điều chuyển từ {h.nguon}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.historyRange && (
            <div className="table-foot">Khoảng {s.historyRange}: {s.history.length} phiếu, tổng {fmtNumber(total)}.</div>
          )}
        </div>
      )}
    </Card>
  );
}

function Activity({ notices }: { notices: Notice[] }) {
  const tone: Record<string, string> = { error: "danger", warn: "warn", success: "success", offer: "warn", info: "info" };
  const label: Record<string, string> = { error: "Lỗi", warn: "Cảnh báo", success: "Thành công", offer: "Đề xuất", info: "Thông tin" };
  return (
    <Card title="Hoạt động trong phiên làm việc">
      {notices.length === 0 ? <Empty>Chưa có hoạt động.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Giờ</th><th>Loại</th><th>Nội dung</th></tr></thead>
            <tbody>
              {notices.map((n, i) => (
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
  );
}
