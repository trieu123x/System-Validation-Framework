"use client";

import { useState } from "react";
import { api, confirmCredit, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Branch, LogRow, Product, RequestRow, Stats } from "@/lib/types";
import { Badge, Card, Dot, Empty, FilterBar, Stat, StateBadge, useAction } from "@/components/ui";

/** Đơn hiện trong bảng "Đơn hàng gần đây": đang chờ CN, đã gửi, đã nhận. */
const RECENT = new Set(["DA_DE_XUAT", "THIEU_HANG", "DA_GIAO", "HOAN_TAT", "TU_CHOI"]);

/** Bộ lọc trang tổng quan. Giữ ở AdminApp để chuyển tab rồi quay lại không mất. */
export type OverviewFilter = { q: string; maCn: string; maSp: string; trangThai: string; ketNoi: "" | "online" | "offline" };
export const NO_FILTER: OverviewFilter = { q: "", maCn: "", maSp: "", trangThai: "", ketNoi: "" };

type Go = (tab: "history" | "stock" | "monitor" | "transfers") => void;

/** Lệnh đáng chú ý cho luồng hoạt động (bỏ PING/PONG, INVENTORY... để không bị nhiễu). */
const ACTIVITY: Record<string, string> = {
  LOGIN_OK: "đăng nhập",
  LOGOUT: "đăng xuất",
  LOW_STOCK: "báo thiếu hàng",
  OFFER: "nhận đề xuất cấp",
  ACCEPT: "đồng ý nhận",
  REJECT: "từ chối đề xuất",
  DELIVERED: "đã được xuất hàng",
  OUT_OF_STOCK: "báo kho tổng không đủ",
  RECEIVED: "xác nhận đã nhận hàng",
  TRANSFER_REQ: "nhận yêu cầu điều chuyển",
  TRANSFER_ACCEPT: "đồng ý điều chuyển",
  TRANSFER_DONE: "đã chuyển hàng",
  BROADCAST: "nhận thông báo",
  ERROR: "bị trả lỗi",
};

export function Overview({ branches, products, alerts: allAlerts, requests, stats, freshIds, showSim, push, live, go, filter: f, setFilter }: {
  branches: Branch[];
  products: Product[];
  alerts: RequestRow[];
  requests: RequestRow[];
  stats: Stats | null;
  freshIds: Set<number>;
  showSim: boolean;
  push: (level: string, text: string) => void;
  live: LogRow[];
  go: Go;
  filter: OverviewFilter;
  setFilter: (f: OverviewFilter) => void;
}) {
  const set = (patch: Partial<OverviewFilter>) => setFilter({ ...f, ...patch });
  const needle = f.q.trim().toLowerCase();
  const pool = branches.filter((b) => showSim || !b.giaLap);
  // Chi nhánh lọt qua ô Chi nhánh + Kết nối; các bảng đơn hàng chỉ lấy đơn của những chi nhánh này
  const byBranch = new Map(pool
    .filter((b) => (!f.maCn || b.maCn === f.maCn) && (!f.ketNoi || b.online === (f.ketNoi === "online")))
    .map((b) => [b.maCn, b]));
  const visible = [...byBranch.values()].filter((b) => !needle || `${b.maCn} ${b.ten}`.toLowerCase().includes(needle));
  const online = visible.filter((b) => b.online).length;
  const matches = (r: RequestRow) => byBranch.has(r.maCn) && (!f.maSp || r.maSp === f.maSp)
    && (!needle || `yc${r.maYc} ${r.maCn} ${r.tenCn} ${r.maSp} ${r.tenSp}`.toLowerCase().includes(needle));
  const alerts = allAlerts.filter(matches);
  const mine = requests.filter(matches);
  const shortage = mine.filter((r) => r.trangThai === "THIEU_HANG").length;
  const shipped = mine.filter((r) => r.trangThai === "DA_GIAO").length;
  const recent = mine.filter((r) => RECENT.has(r.trangThai) && (!f.trangThai || r.trangThai === f.trangThai))
    .sort((a, b) => b.capNhatLuc.localeCompare(a.capNhatLuc))
    .slice(0, 15);
  const activity = live
    .filter((m) => ACTIVITY[m.lenh] && !(m.maCn ?? "").startsWith("SIM") && (m.lenh !== "ERROR" || m.chieu === "OUT"))
    .filter((m) => m.maCn != null && byBranch.has(m.maCn) && (!needle || m.maCn.toLowerCase().includes(needle)))
    .slice(0, 12);
  const filtering = f.q !== "" || f.maCn !== "" || f.maSp !== "" || f.trangThai !== "" || f.ketNoi !== "";

  return (
    <>
      <FilterBar active={filtering} onClear={() => setFilter(NO_FILTER)}>
        <label className="field filterbar-search">Tìm kiếm
          <input type="search" placeholder="Mã YC, mã / tên chi nhánh, mặt hàng" value={f.q}
            onChange={(e) => set({ q: e.target.value })} />
        </label>
        <label className="field">Chi nhánh
          <select value={f.maCn} onChange={(e) => set({ maCn: e.target.value })}>
            <option value="">Tất cả</option>
            {pool.map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn} – {b.ten}</option>)}
          </select>
        </label>
        <label className="field">Mặt hàng
          <select value={f.maSp} onChange={(e) => set({ maSp: e.target.value })}>
            <option value="">Tất cả</option>
            {products.map((p) => <option key={p.maSp} value={p.maSp}>{p.maSp} – {p.ten}</option>)}
          </select>
        </label>
        <label className="field">Trạng thái đơn
          <select value={f.trangThai} onChange={(e) => set({ trangThai: e.target.value })}>
            <option value="">Tất cả</option>
            {[...RECENT].map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field">Kết nối
          <select value={f.ketNoi} onChange={(e) => set({ ketNoi: e.target.value as OverviewFilter["ketNoi"] })}>
            <option value="">Tất cả</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </FilterBar>

      <div className="kpis">
        <Stat label="Chi nhánh online" value={`${online}/${visible.length}`}
          tone={online === visible.length ? "success" : online === 0 ? "danger" : "warn"}
          hint={`${visible.length - online} offline`} />
        <Stat label="Cảnh báo chờ xử lý" value={alerts.length} tone={alerts.length ? "danger" : undefined}
          hint={alerts.length ? "cần gửi đề xuất" : "không có"} />
        <Stat label="Đã gửi, chờ CN nhận" value={shipped} hint="xem yêu cầu" onClick={() => go("history")} />
        <Stat label="Báo không đủ hàng" value={shortage} tone={shortage ? "warn" : undefined}
          hint="xem điều chuyển" onClick={() => go("transfers")} />
        <Stat label="Tin nhắn / phút" value={stats?.tinPhutQua ?? "—"} hint={`${stats?.ketNoi ?? 0} kết nối TCP`}
          onClick={() => go("monitor")} />
        <Stat label={`Luồng JVM (${stats?.runtime?.ioMode ?? "?"})`} value={stats?.runtime?.threads ?? "—"}
          hint={stats?.runtime ? `heap ${Math.round(stats.runtime.heapUsedMb)} MB` : undefined} />
      </div>

      <div className="dash">
        <div className="col">
          <Card title={<>Cảnh báo thiếu hàng <span className="muted">· sắp theo mức thiếu</span></>}>
            {alerts.length === 0 ? <Empty>{filtering ? "Không có cảnh báo nào khớp bộ lọc." : "Không có cảnh báo nào."}</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mã YC</th><th>Chi nhánh</th><th>Mặt hàng</th><th className="num">Tồn / ngưỡng</th>
                      <th className="num">Thiếu</th><th className="num">Kho tổng</th><th className="num">Số lượng gửi</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <AlertRow key={a.maYc} alert={a} fresh={freshIds.has(a.maYc)} push={push} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={<>Đơn hàng gần đây <span className="muted">· cập nhật trực tiếp</span></>}
            actions={<button className="btn-link" onClick={() => go("history")}>Xem tất cả</button>}>
            {recent.length === 0 ? <Empty>{filtering ? "Không có đơn nào khớp bộ lọc." : "Chưa có đơn hàng nào."}</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mã YC</th><th>Chi nhánh</th><th>Mặt hàng</th><th className="num">Số lượng</th><th>Trạng thái</th>
                      <th>Cập nhật</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => <RecentRow key={r.maYc} r={r} fresh={freshIds.has(r.maYc)} push={push} />)}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="col">
          <Card title="Chi nhánh">
            {visible.length === 0 ? <Empty>Không có chi nhánh nào khớp bộ lọc.</Empty> : (
              <div className="table-wrap scroll" style={{ maxHeight: 340 }}>
                <table>
                  <thead>
                    <tr><th>Chi nhánh</th><th className="num">YC mở</th><th className="num">Tin chờ</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((b) => (
                      <tr key={b.maCn}>
                        <td className="nowrap" title={b.online ? "Online" : "Offline"}>
                          <Dot on={b.online} /><b>{b.maCn}</b> <span className="muted">{b.ten}</span>
                        </td>
                        <td className="num">{b.ycMo || ""}</td>
                        <td className="num">{b.tinCho ? <Badge tone="warn">{b.tinCho}</Badge> : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Hoạt động gần đây" actions={<button className="btn-link" onClick={() => go("monitor")}>Luồng tin</button>}>
            {activity.length === 0 ? <Empty>Chưa có hoạt động kể từ khi mở trang.</Empty> : (
              <div>
                {activity.map((m, i) => (
                  <div key={m.thoiGian + i} className="activity-row">
                    <span className="activity-time">{m.thoiGian.slice(11, 19)}</span>
                    <span><b>{m.maCn ?? "?"}</b> {ACTIVITY[m.lenh]} <span className="muted mono">{m.lenh}</span></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AlertRow({ alert: a, fresh, push }: { alert: RequestRow; fresh: boolean; push: (l: string, t: string) => void }) {
  const [qty, setQty] = useState(String(a.goiY));
  const { run, busy } = useAction(push);
  const n = Number(qty);
  const ship = async () => {
    if (await confirmCredit(a.maCn, n * a.giaXuat)) {
      run(() => api(`/api/requests/${a.maYc}/ship`, { soLuong: n }), `Đã gửi ${n} ${a.tenSp} tới ${a.tenCn}`);
    }
  };
  const shortage = () =>
    run(() => api(`/api/requests/${a.maYc}/shortage`, { soLuong: n }), `Đã báo ${a.tenCn}: kho tổng không đủ ${a.tenSp}`);
  const offer = () =>
    run(() => api(`/api/requests/${a.maYc}/offer`, { soLuong: n }), `Đã gửi đề xuất YC${a.maYc} để ${a.maCn} xác nhận`);

  return (
    <tr className={fresh ? "row-new" : ""}>
      <td className="code">YC{a.maYc}</td>
      <td className="nowrap"><b>{a.maCn}</b> <span className="muted">{a.tenCn}</span></td>
      <td>
        {a.tenSp}
        {a.soLuongXin != null && <> <Badge tone="info">CN xin {fmtNumber(a.soLuongXin)} · từ thông báo</Badge></>}
      </td>
      <td className="num">{fmtNumber(a.soLuongCon)} / {fmtNumber(a.nguong)}</td>
      <td className="num" style={{ color: "var(--danger)", fontWeight: 600 }}>{fmtNumber(a.mucThieu)}</td>
      <td className="num nowrap">
        {a.tonTong < n && <><Badge tone="warn">không đủ</Badge>{" "}</>}
        {fmtNumber(a.tonTong)}
      </td>
      <td className="num">
        <input type="number" min={1} value={qty} style={{ height: 26 }} onChange={(e) => setQty(e.target.value)}
          aria-label="Số lượng gửi" />
      </td>
      <td className="right nowrap">
        <button className="btn btn-success btn-sm" disabled={busy || !(n > 0) || a.tonTong < n} onClick={ship}
          title={a.tonTong < n ? "Kho tổng không đủ số lượng này" : "Xuất kho tổng và gửi ngay"}>Gửi hàng</button>{" "}
        <button className="btn btn-sm btn-danger" disabled={busy || !(n > 0)} onClick={shortage}
          title="Báo chi nhánh kho tổng không đủ hàng">Báo hết hàng</button>{" "}
        <button className="btn btn-sm" disabled={busy || !(n > 0)} onClick={offer}
          title="Gửi đề xuất, chi nhánh xác nhận rồi mới xuất kho">Đề xuất</button>
      </td>
    </tr>
  );
}

/** Đơn đã xử lý: Đã gửi → (CN bấm nhận) → Đã nhận. Đơn báo thiếu có thể gửi lại khi đã nhập thêm kho. */
function RecentRow({ r, fresh, push }: { r: RequestRow; fresh: boolean; push: (l: string, t: string) => void }) {
  const { run, busy } = useAction(push);
  const qty = r.soLuongGiao ?? r.soLuongChot ?? r.soLuongDeXuat;
  return (
    <tr className={fresh ? "row-new" : ""}>
      <td className="code">YC{r.maYc}</td>
      <td className="nowrap">{r.maCn} <span className="muted">{r.tenCn}</span></td>
      <td>{r.tenSp}</td>
      <td className="num">{fmtNumber(qty)}</td>
      <td><StateBadge state={r.trangThai} /></td>
      <td className="muted nowrap">{r.capNhatLuc.slice(11, 19)}</td>
      <td className="right nowrap">
        {r.trangThai === "THIEU_HANG" && qty != null && (
          <button className="btn btn-sm btn-success" disabled={busy || r.tonTong < qty}
            title={r.tonTong < qty ? `Kho tổng còn ${r.tonTong}` : "Xuất kho tổng và gửi ngay"}
            onClick={async () => {
              if (await confirmCredit(r.maCn, qty * r.giaXuat)) {
                run(() => api(`/api/requests/${r.maYc}/ship`, { soLuong: qty }), `Đã gửi YC${r.maYc}`);
              }
            }}>
            Gửi hàng
          </button>
        )}
      </td>
    </tr>
  );
}
