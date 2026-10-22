"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { Branch, IpRow, LogRow, SecurityEventRow, SecurityOverview, SessionRow } from "@/lib/types";
import { Badge, Card, Empty, Stat, useAction } from "@/components/ui";
import { Monitor } from "@/components/admin/Comms";

type Push = (l: string, t: string) => void;

export const LEVEL_TONE: Record<string, string> = { HIGH: "danger", MEDIUM: "warn", LOW: "muted" };
const MODE_TEXT: Record<string, string> = { OFF: "off (tắt)", DETECT: "detect (chỉ ghi)", BLOCK: "block (tự chặn)" };
const ACTION_TEXT: Record<string, string> = {
  GHI_NHAN: "Ghi nhận", CHAN_IP: "Chặn IP", NGAT: "Ngắt phiên", GIOI_HAN: "Giới hạn", KHOA_TK: "Khoá tài khoản",
};
const IP_STATE: Record<IpRow["trangThai"], [string, string]> = {
  BINH_THUONG: ["success", "Bình thường"], NGHI_VAN: ["warn", "Nghi vấn"], BI_CHAN: ["danger", "Bị chặn"],
};

/** Giám sát: an ninh (KPI, sự kiện, IP, phiên) và tab con "Luồng tin" (giao thức realtime + nhat_ky). */
export function Security({ version, live, branches, clearLive, push }: {
  version: number; live: LogRow[]; branches: Branch[]; clearLive: () => void; push: Push;
}) {
  const [sub, setSub] = useState<"security" | "stream">("security");
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <button className={`btn ${sub === "security" ? "btn-primary" : ""}`} onClick={() => setSub("security")}>An ninh</button>
        <button className={`btn ${sub === "stream" ? "btn-primary" : ""}`} onClick={() => setSub("stream")}>Luồng tin</button>
      </div>
      {sub === "stream" ? <Monitor live={live} branches={branches} clearLive={clearLive} />
        : <SecurityPanel version={version} branches={branches} push={push} />}
    </>
  );
}

function SecurityPanel({ version, branches, push }: { version: number; branches: Branch[]; push: Push }) {
  const [ov, setOv] = useState<SecurityOverview | null>(null);
  const [tick, setTick] = useState(0);

  // bảng IP, phiên, KPI là số đếm trong bộ nhớ server: hỏi lại mỗi 3 giây
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api<SecurityOverview>("/api/security/overview").then(setOv).catch(() => {});
  }, [tick, version]);

  const ev = ov?.suKien24h;
  return (
    <>
      <div className="kpis">
        <Stat label="Kết nối TCP" value={fmtNumber(ov?.ketNoi)} />
        <Stat label="Tin/giây (TB 10 s)" value={ov ? ov.tinGiay.toFixed(1) : "—"} />
        <Stat label="IP đang bị chặn" value={fmtNumber(ov?.ipBiChan)} tone={ov?.ipBiChan ? "danger" : undefined} />
        <Stat label="Sự kiện 24 giờ" value={ev ? ev.high + ev.medium + ev.low : "—"} tone={ev?.high ? "danger" : undefined}
          hint={ev && <>{ev.high} HIGH · {ev.medium} MEDIUM · {ev.low} LOW</>} />
        <Stat label="security.mode" value={ov ? MODE_TEXT[ov.mode] : "—"} tone={ov?.mode === "BLOCK" ? "success" : "warn"}
          hint={ov?.suKienBiBo ? `bỏ ${ov.suKienBiBo} sự kiện vì hàng đợi đầy` : undefined} />
      </div>
      <Events version={version} branches={branches} />
      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <IpTable tick={tick + version} push={push} />
        <Sessions tick={tick + version} push={push} />
      </div>
    </>
  );
}

function Events({ version, branches }: { version: number; branches: Branch[] }) {
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [f, setF] = useState({ muc: "", loai: "", nguon: "", ip: "", maCn: "" });

  useEffect(() => {
    const q = new URLSearchParams({ ...f, limit: "300" }).toString();
    api<SecurityEventRow[]>(`/api/security/events?${q}`).then(setRows).catch(() => {});
  }, [version, f]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value.trim() });
  const types = [...new Set(rows.map((r) => r.loai))].sort();

  return (
    <Card title={<>Sự kiện an ninh <span className="muted">· {rows.length} gần nhất, cập nhật realtime</span></>}>
      <div className="filterbar">
        <label className="field">Mức
          <select value={f.muc} onChange={set("muc")}>
            <option value="">Tất cả</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option>
          </select>
        </label>
        <label className="field">Mã sự kiện
          <input list="sec-types" value={f.loai} onChange={set("loai")} placeholder="VD: BRUTE_FORCE" />
          <datalist id="sec-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field">Nguồn
          <select value={f.nguon} onChange={set("nguon")}>
            <option value="">Tất cả</option><option>SERVER</option><option>CLIENT</option><option>ADMIN</option>
          </select>
        </label>
        <label className="field">IP<input value={f.ip} onChange={set("ip")} placeholder="VD: 127.0.0.2" /></label>
        <label className="field">Chi nhánh
          <select value={f.maCn} onChange={set("maCn")}>
            <option value="">Tất cả</option>
            {branches.filter((b) => !b.giaLap).map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn}</option>)}
          </select>
        </label>
      </div>
      {rows.length === 0 ? <Empty>Chưa có sự kiện nào khớp bộ lọc.</Empty> : (
        <div className="table-wrap scroll" style={{ maxHeight: 420 }}>
          <table>
            <thead>
              <tr><th>Thời gian</th><th>Mức</th><th>Mã</th><th>Nguồn</th><th>IP</th><th>CN</th><th>Chi tiết</th><th>Xử lý</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `${r.thoiGian}-${i}`} className={r.muc === "HIGH" ? "low" : ""}>
                  <td className="muted nowrap">{r.thoiGian.slice(5, 19)}</td>
                  <td><Badge tone={LEVEL_TONE[r.muc]}>{r.muc}</Badge></td>
                  <td className="code">{r.loai}</td>
                  <td>{r.nguon}</td>
                  <td className="nowrap">{r.ip ?? "—"}</td>
                  <td>{r.maCn ?? ""}</td>
                  {/* chi tiết có thể do client gửi lên: React tự escape, chỉ hiển thị dạng chữ */}
                  <td style={{ maxWidth: 420, wordBreak: "break-word" }}>{r.chiTiet}</td>
                  <td className="nowrap">{ACTION_TEXT[r.hanhDong] ?? r.hanhDong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function IpTable({ tick, push }: { tick: number; push: Push }) {
  const { run, busy } = useAction(push);
  const [rows, setRows] = useState<IpRow[]>([]);
  const [minutes, setMinutes] = useState("10");
  const [mine, setMine] = useState(0);

  useEffect(() => {
    api<IpRow[]>("/api/security/ips").then(setRows).catch(() => {});
  }, [tick, mine]);

  const ban = async (ip: string) => {
    if (await run(() => api("/api/security/bans", { ip, phut: Number(minutes) }), `Đã chặn ${ip} trong ${minutes} phút`)) {
      setMine((x) => x + 1);
    }
  };
  const unban = async (ip: string) => {
    if (await run(() => api(`/api/security/bans/${encodeURIComponent(ip)}`, undefined, "DELETE"), `Đã bỏ chặn ${ip}`)) {
      setMine((x) => x + 1);
    }
  };

  return (
    <Card title={<>Địa chỉ IP <span className="muted">· {rows.length}</span></>}
      actions={(
        <label className="row muted">Chặn trong
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            <option value="5">5 phút</option><option value="10">10 phút</option>
            <option value="60">1 giờ</option><option value="1440">1 ngày</option>
          </select>
        </label>
      )}>
      {rows.length === 0 ? <Empty>Chưa có IP nào.</Empty> : (
        <div className="table-wrap scroll" style={{ maxHeight: 360 }}>
          <table>
            <thead>
              <tr>
                <th>IP</th><th className="num">Kết nối</th><th className="num">Tin/phút</th>
                <th className="num">LOGIN_FAIL</th><th className="num">E01</th><th>Trạng thái</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [tone, label] = IP_STATE[r.trangThai];
                return (
                  <tr key={r.ip} className={r.trangThai === "BI_CHAN" ? "low" : r.trangThai === "NGHI_VAN" ? "warn" : ""}>
                    <td className="nowrap">{r.ip}{r.phienHopLe > 0 && <span className="muted"> · {r.phienHopLe} phiên</span>}</td>
                    <td className="num">{r.ketNoi}</td>
                    <td className="num">{fmtNumber(r.tinPhut)}</td>
                    <td className="num">{r.loginFail}</td>
                    <td className="num">{r.e01}</td>
                    <td className="nowrap">
                      <Badge tone={tone}>{label}</Badge>
                      {r.chanDen && <span className="muted"> đến {r.chanDen.slice(11, 16)}</span>}
                    </td>
                    <td className="right nowrap">
                      {r.trangThai === "BI_CHAN"
                        ? <button className="btn btn-sm" disabled={busy} onClick={() => unban(r.ip)}>Bỏ chặn</button>
                        : <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => ban(r.ip)}>Chặn</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Sessions({ tick, push }: { tick: number; push: Push }) {
  const { run, busy } = useAction(push);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [mine, setMine] = useState(0);

  useEffect(() => {
    api<SessionRow[]>("/api/security/sessions").then(setRows).catch(() => {});
  }, [tick, mine]);

  const kick = async (s: SessionRow) => {
    if (await run(() => api(`/api/security/sessions/${s.id}/kick`, {}), `Đã ngắt phiên #${s.id}`)) {
      setMine((x) => x + 1);
    }
  };

  return (
    <Card title={<>Phiên TCP <span className="muted">· {rows.length}</span></>}>
      {rows.length === 0 ? <Empty>Không có kết nối nào.</Empty> : (
        <div className="table-wrap scroll" style={{ maxHeight: 360 }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Chi nhánh</th><th>IP</th><th>Mở lúc</th><th className="num">Vào/ra</th>
                <th className="num">Tin/s</th><th>Lệnh cuối</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={s.tinGiay > 20 ? "warn" : ""}>
                  <td className="code">{s.id}</td>
                  <td>{s.maCn ?? <span className="muted">chưa đăng nhập</span>}</td>
                  <td className="nowrap">{s.ip}</td>
                  <td className="muted nowrap">{s.moLuc.slice(11)}</td>
                  <td className="num nowrap">{fmtNumber(s.tinVao)} / {fmtNumber(s.tinRa)}</td>
                  <td className="num">{s.tinGiay.toFixed(1)}</td>
                  <td className="code">{s.lenhCuoi}</td>
                  <td className="right"><button className="btn btn-sm btn-danger" disabled={busy} onClick={() => kick(s)}>Ngắt</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
