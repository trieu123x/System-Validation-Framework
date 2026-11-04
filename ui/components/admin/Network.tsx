"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Branch, BrowserConnection, NetworkBranch, NetworkEvent } from "@/lib/types";
import { Badge, Card, Empty, Stat } from "@/components/ui";

const EVENT_NAMES: Record<string, string> = {
  CONNECTED: "Kết nối", DISCONNECTED: "Ngắt kết nối", TIMEOUT: "Không phản hồi",
  RECONNECTED: "Kết nối lại", BROWSER_CONNECTED: "Trình duyệt đã kết nối",
  BROWSER_OFFLINE: "Trình duyệt mất liên lạc", BROWSER_RECONNECTED: "Trình duyệt kết nối lại",
};
const REASONS: Record<string, string> = {
  LOGIN_SUCCESS: "Đăng nhập thành công", CONNECTION_RESTORED: "Kết nối phục hồi",
  REMOTE_CLOSED: "Đã đóng kết nối", IO_ERROR: "Lỗi kết nối",
  PONG_TIMEOUT: "Không phản hồi", CLIENT_LOGOUT: "Đăng xuất chủ động",
  SERVER_SHUTDOWN: "Công ty tạm ngừng kết nối", SERVER_CLOSE: "Công ty đóng kết nối",
  ADMIN_KICK: "Quản trị viên ngắt phiên", IP_BANNED: "Quản trị viên chặn địa chỉ",
  SECURITY_KICK: "Bị ngắt bởi bảo mật", SLOW_CONSUMER: "Phản hồi chậm",
  WRITE_FAILURE: "Không ghi được dữ liệu", PRELOGIN_TIMEOUT: "Chưa đăng nhập kịp",
  HEARTBEAT_START: "Bắt đầu phiên", HEARTBEAT_TIMEOUT: "Trình duyệt không phản hồi",
  HEARTBEAT_RESTORED: "Trình duyệt đã kết nối lại", GATEWAY_DISCONNECTED: "Chi nhánh mất kết nối",
  USER_LOGOUT: "Người dùng đăng xuất", SESSION_EXPIRED: "Phiên đăng nhập hết hạn",
};
const stateName: Record<NetworkBranch["trangThai"], string> = {
  ONLINE: "Đang kết nối", OFFLINE: "Mất kết nối", AWAITING_PONG: "Đang kiểm tra",
};

function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút ${s % 60} giây`;
  return `${Math.floor(s / 3600)} giờ ${Math.floor(s % 3600 / 60)} phút`;
}
function shortTime(t: string | null) { return t ? t.slice(0, 19) : "Chưa có"; }

/** Admin-only TCP status and persistent network history. Polling is excluded from scraping detection. */
export function Network({ branches }: { branches: Branch[] }) {
  const [rows, setRows] = useState<NetworkBranch[]>([]);
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [browsers, setBrowsers] = useState<BrowserConnection[]>([]);
  const [branch, setBranch] = useState("");
  const [showSim, setShowSim] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [status, history, browserStatus] = await Promise.all([
          api<NetworkBranch[]>("/api/network/branches"),
          api<NetworkEvent[]>(`/api/network/events?${new URLSearchParams({ maCn: branch, limit: "150" })}`),
          api<BrowserConnection[]>("/api/network/browsers"),
        ]);
        if (active) { setRows(status); setEvents(history); setBrowsers(browserStatus); setError(""); }
      } catch {
        if (active) setError("Không tải được trạng thái kết nối. Vui lòng thử lại.");
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [branch, refresh]);

  const shown = rows.filter((r) => (showSim || !r.giaLap) && (!branch || r.maCn === branch));
  const active = shown.filter(r => r.trangThai === "ONLINE").length;
  const waiting = shown.filter(r => r.trangThai === "AWAITING_PONG").length;
  const offline = shown.filter(r => r.trangThai === "OFFLINE").length;
  const shownBrowsers = browsers.filter(b => (!branch || b.maCn === branch) &&
    (showSim || !branches.find(r => r.maCn === b.maCn)?.giaLap));

  return <>
    <div className="kpis">
      <Stat label="Đang kết nối" value={active} tone="success" />
      <Stat label="Đang kiểm tra" value={waiting} tone={waiting ? "warn" : undefined} />
      <Stat label="Mất kết nối" value={offline} tone={offline ? "danger" : undefined} />
      <Stat label="Sự cố kết nối 24 giờ" value={shown.reduce((n, r) => n + r.suCo24h, 0)} />
      <Stat label="Trình duyệt mất liên lạc 24 giờ" value={shown.reduce((n, r) => n + r.browserSuCo24h, 0)} tone={shown.some(r => r.browserSuCo24h > 0) ? "danger" : undefined} />
    </div>
    <Card title="Kết nối chi nhánh" actions={<button className="btn btn-sm" onClick={() => setRefresh(v => v + 1)}>Làm mới</button>}>
      <div className="row" style={{ marginBottom: 10, gap: 10 }}>
        <label className="field">Chi nhánh
          <select value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.filter(b => showSim || !b.giaLap).map(b => <option key={b.maCn} value={b.maCn}>{b.maCn}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={showSim} onChange={e => setShowSim(e.target.checked)} />Hiện chi nhánh giả lập</label>
      </div>
      {error && <p role="alert">{error}</p>}
      {shown.length === 0 ? <Empty>Chưa có chi nhánh phù hợp.</Empty> : <div className="table-wrap scroll" style={{ maxHeight: 430 }}>
        <table>
          <thead><tr><th>Chi nhánh</th><th>Trạng thái</th><th>Hoạt động cuối (phiên hiện tại)</th><th>IP phiên</th><th>Sự kiện gần nhất</th><th>Sự cố 24h</th><th>Timeout 24h</th><th>Kết nối lại 24h</th><th>Browser mất liên lạc 24h</th><th>Browser phục hồi 24h</th></tr></thead>
          <tbody>{shown.map(r => <tr key={r.maCn}>
            <td><b>{r.maCn}</b><div className="muted">{r.ten}</div></td>
            <td><Badge tone={r.trangThai === "ONLINE" ? "success" : r.trangThai === "AWAITING_PONG" ? "warn" : "danger"}>{stateName[r.trangThai]}</Badge></td>
            <td className="nowrap">{shortTime(r.hoatDongCuoi)}</td>
            <td>{r.ipHienTai ?? "—"}</td>
            <td><span>{EVENT_NAMES[r.suKienCuoi ?? ""] ?? "Chưa có"}</span><div className="muted">{shortTime(r.suKienLuc)}</div></td>
            <td className="num">{r.suCo24h}</td><td className="num">{r.timeout24h}</td><td className="num">{r.ketNoiLai24h}</td>
            <td className="num">{r.browserSuCo24h}</td><td className="num">{r.browserKetNoiLai24h}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>
    <Card title="Trình duyệt chi nhánh">
      {shownBrowsers.length === 0 ? <Empty>Chưa có trình duyệt đăng nhập.</Empty> :
      <div className="table-wrap scroll" style={{ maxHeight: 350 }}><table>
        <thead><tr><th>Chi nhánh</th><th>Phiên trình duyệt</th><th>Trạng thái</th><th>Hoạt động cuối</th><th>Mất liên lạc từ</th><th>Địa chỉ kết nối</th></tr></thead>
        <tbody>{shownBrowsers.map(b => <tr key={`${b.maCn}-${b.browserId}`}>
          <td><b>{b.maCn}</b></td><td className="muted">{b.browserId}</td>
          <td><Badge tone={b.trangThai === "ONLINE" ? "success" : "danger"}>{b.trangThai === "ONLINE" ? "Đang hoạt động" : "Mất liên lạc"}</Badge></td>
          <td className="nowrap">{shortTime(b.lanCuoi)}</td><td className="nowrap">{shortTime(b.offlineTu)}</td>
          <td>{b.ip || "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
    <Card title="Lịch sử kết nối">
      {events.filter(e => showSim || !e.maCn.startsWith("SIM")).length === 0 ? <Empty>Chưa có sự kiện kết nối.</Empty> :
        <div className="table-wrap scroll" style={{ maxHeight: 480 }}>
          <table>
            <thead><tr><th>Thời gian</th><th>Chi nhánh</th><th>Sự kiện</th><th>Nguyên nhân</th><th>Nguồn</th><th>Gián đoạn</th><th>Phiên</th><th>IP</th></tr></thead>
            <tbody>{events.filter(e => showSim || !e.maCn.startsWith("SIM")).map(e => <tr key={e.id}>
              <td className="muted nowrap">{shortTime(e.thoiGian)}</td><td><b>{e.maCn}</b></td>
              <td><Badge tone={e.suKien === "RECONNECTED" || e.suKien === "CONNECTED" || e.suKien === "BROWSER_CONNECTED" || e.suKien === "BROWSER_RECONNECTED" ? "success" : e.suKien === "TIMEOUT" || e.suKien === "BROWSER_OFFLINE" ? "danger" : "warn"}>{EVENT_NAMES[e.suKien] ?? e.suKien}</Badge></td>
              <td>{REASONS[e.lyDo] ?? e.lyDo}</td><td>{e.browserId ? `Trình duyệt ${e.browserId.slice(0, 8)}` : "Ứng dụng chi nhánh"}</td><td className="nowrap">{duration(e.gianDoanMs)}</td>
              <td className="muted">#{e.sessionId}</td><td>{e.ip}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </Card>
  </>;
}
