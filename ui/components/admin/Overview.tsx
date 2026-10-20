"use client";

import { useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { Branch, LogRow, RequestRow, Stats } from "@/lib/types";
import { Badge, Card, Dot, Empty, Stat, StateBadge, useAction } from "@/components/ui";

/** Đơn hiện trong bảng "Đơn hàng gần đây": đang chờ CN, đã gửi, đã nhận. */
const RECENT = new Set(["DA_DE_XUAT", "THIEU_HANG", "DA_GIAO", "HOAN_TAT", "TU_CHOI"]);

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

export function Overview({ branches, alerts, requests, stats, freshIds, showSim, push, live, go }: {
  branches: Branch[];
  alerts: RequestRow[];
  requests: RequestRow[];
  stats: Stats | null;
  freshIds: Set<number>;
  showSim: boolean;
  push: (level: string, text: string) => void;
  live: LogRow[];
  go: Go;
}) {
  const visible = branches.filter((b) => showSim || !b.giaLap);
  const online = visible.filter((b) => b.online).length;
  const sim = new Set(branches.filter((b) => b.giaLap).map((b) => b.maCn));
  const mine = requests.filter((r) => showSim || !sim.has(r.maCn));
  const shortage = mine.filter((r) => r.trangThai === "THIEU_HANG").length;
  const shipped = mine.filter((r) => r.trangThai === "DA_GIAO").length;
  const recent = mine.filter((r) => RECENT.has(r.trangThai))
    .sort((a, b) => b.capNhatLuc.localeCompare(a.capNhatLuc))
    .slice(0, 15);
  const activity = live
    .filter((m) => ACTIVITY[m.lenh] && !(m.maCn ?? "").startsWith("SIM") && (m.lenh !== "ERROR" || m.chieu === "OUT"))
    .slice(0, 12);

  return (
    <>
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
            {alerts.length === 0 ? <Empty>Không có cảnh báo nào.</Empty> : (
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
            {recent.length === 0 ? <Empty>Chưa có đơn hàng nào.</Empty> : (
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
  const ship = () =>
    run(() => api(`/api/requests/${a.maYc}/ship`, { soLuong: n }), `Đã gửi ${n} ${a.tenSp} tới ${a.tenCn}`);
  const shortage = () =>
    run(() => api(`/api/requests/${a.maYc}/shortage`, { soLuong: n }), `Đã báo ${a.tenCn}: kho tổng không đủ ${a.tenSp}`);
  const offer = () =>
    run(() => api(`/api/requests/${a.maYc}/offer`, { soLuong: n }), `Đã gửi đề xuất YC${a.maYc} để ${a.maCn} xác nhận`);

  return (
    <tr className={fresh ? "row-new" : ""}>
      <td className="code">YC{a.maYc}</td>
      <td className="nowrap"><b>{a.maCn}</b> <span className="muted">{a.tenCn}</span></td>
      <td>{a.tenSp}</td>
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
            onClick={() => run(() => api(`/api/requests/${r.maYc}/ship`, { soLuong: qty }), `Đã gửi YC${r.maYc}`)}>
            Gửi hàng
          </button>
        )}
      </td>
    </tr>
  );
}
