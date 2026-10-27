"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { Branch, IpRow, LogRow, SecurityEventRow, SecurityOverview, SessionRow, ScrapingMetadata, ScrapingBlock } from "@/lib/types";
import { Badge, Card, Empty, Stat, useAction } from "@/components/ui";
import { AuditTrail, Monitor } from "@/components/admin/Comms";
import { Network } from "@/components/admin/Network";

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
  const [sub, setSub] = useState<"security" | "stream" | "audit" | "network">("security");
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <button className={`btn ${sub === "security" ? "btn-primary" : ""}`} onClick={() => setSub("security")}>An ninh</button>
        <button className={`btn ${sub === "network" ? "btn-primary" : ""}`} onClick={() => setSub("network")}>Kết nối chi nhánh</button>
        <button className={`btn ${sub === "stream" ? "btn-primary" : ""}`} onClick={() => setSub("stream")}>Luồng tin</button>
        <button className={`btn ${sub === "audit" ? "btn-primary" : ""}`} onClick={() => setSub("audit")}>Nhật ký thao tác</button>
      </div>
      {sub === "network" ? <Network branches={branches} />
        : sub === "stream" ? <Monitor live={live} branches={branches} clearLive={clearLive} />
        : sub === "audit" ? <AuditTrail branches={branches} />
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
      <div className="kpis">
        <Stat label="Anti-scraping" value={ov?.scraping?.mode ?? "—"} hint="Theo dõi truy cập bất thường" />
        <Stat label="Đã giới hạn (từ lúc chạy)" value={fmtNumber(ov?.scraping?.limited)} />
        <Stat label="Tài khoản tạm khóa" value={fmtNumber(ov?.scraping?.activeBlocks)} />
        <Stat label="Email đã gửi / lỗi" value={ov?.mail ? `${ov.mail.sent} / ${ov.mail.failed}` : "—"}
          tone={ov?.mail?.failed ? "danger" : undefined}
          hint={ov?.mail ? `${ov.mail.enabled ? "SMTP bật" : "SMTP tắt"} · ${ov.mail.pending} đang chờ · ${ov.mail.skipped} bỏ trùng/giới hạn · ${ov.mail.rejected} bị từ chối` : undefined} />
      </div>
      {!!ov?.scrapingPersistence?.failures && <p role="alert" className="muted">Có {ov.scrapingPersistence.failures} lỗi lưu audit/khóa. Trạng thái chưa lưu có thể mất khi khởi động lại.</p>}
      {!!ov?.scraping?.capacityMisses && <p role="alert">Bộ đếm đã đầy: {ov.scraping.capacityMisses} yêu cầu chưa được theo dõi.</p>}
      <ScrapingBlocks tick={tick + version} push={push} />
      <Events version={tick + version} branches={branches} push={push} />
      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <IpTable tick={tick + version} push={push} />
        <Sessions tick={tick + version} push={push} />
      </div>
    </>
  );
}

function Events({ version, branches, push }: { version: number; branches: Branch[]; push: Push }) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const { run } = useAction(push);
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [f, setF] = useState({ muc: "", loai: "", nguon: "", ip: "", maCn: "" });

  useEffect(() => {
    const q = new URLSearchParams({ ...f, limit: "100", offset: String(offset) }).toString();
    api<SecurityEventRow[]>(`/api/security/events?${q}`).then(setRows).catch(() => {});
  }, [version, f, offset, refresh]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setOffset(0); setF({ ...f, [k]: e.target.value.trim() }); };
  const types = [...new Set(["SCRAPING", "CLIENT_SCRAPING", ...rows.map((r) => r.loai)])].sort();
  const review = async (row: SecurityEventRow, verdict: string) => {
    const reason = window.prompt("Lý do đánh giá sự kiện:");
    if (!reason?.trim()) return;
    if (await run(() => api(`/api/security/scraping/events/${row.id}/review`, { verdict, reason }), "Đã lưu đánh giá")) setRefresh(x => x + 1);
  };
  const exportReport = () => {
    const safe = rows.map(({ ip, maCn, eventKey, thoiGian, loai, muc, hanhDong, metadata, review, emailStatus }) =>
      ({ ip: maskIp(ip), maCn, eventKey, thoiGian, loai, muc, hanhDong, metadata: parseMetadata(metadata), review, emailStatus }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "security-events.json"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card title={<>Sự kiện an ninh <span className="muted">· {rows.length} gần nhất, cập nhật realtime</span></>}>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={() => { setOffset(0); setF({ ...f, loai: "SCRAPING" }); }}>Chỉ scraping server</button>
        <button className="btn" onClick={exportReport}>Xuất trang hiện tại (ẩn IP)</button>
        <button className="btn" disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 100))}>Trước</button>
        <span>{offset + 1}–{offset + rows.length}</span>
        <button className="btn" disabled={rows.length < 100} onClick={() => setOffset(x => x + 100)}>Sau</button>
      </div>
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
              <tr><th>Thời gian</th><th>Mức</th><th>Mã</th><th>Nguồn</th><th>IP</th><th>CN</th><th>Chi tiết / Risk</th><th>Xử lý</th><th>Email</th><th>Đánh giá</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `${r.thoiGian}-${i}`} className={r.muc === "HIGH" ? "low" : ""}>
                  <td className="muted nowrap">{r.thoiGian.slice(5, 19)}</td>
                  <td><Badge tone={LEVEL_TONE[r.muc]}>{r.muc}</Badge></td>
                  <td className="code">{r.loai}</td>
                  <td>{r.nguon}</td>
                  <td className="nowrap">{maskIp(r.ip)}</td>
                  <td>{r.maCn ?? ""}</td>
                  {/* chi tiết có thể do client gửi lên: React tự escape, chỉ hiển thị dạng chữ */}
                  <td style={{ maxWidth: 420, wordBreak: "break-word" }}>
                    <details><summary>{r.chiTiet}<br /><b>{parseMetadata(r.metadata).channel ?? ""} · Risk {parseMetadata(r.metadata).riskScore ?? "—"}</b></summary>
                      <div className="muted">Event: {r.eventKey ?? r.id}</div>
                      <div>{parseMetadata(r.metadata).requestCount ?? "—"} yêu cầu / {parseMetadata(r.metadata).windowSeconds ?? "—"} giây</div>
                      <div>{parseMetadata(r.metadata).resource} · {parseMetadata(r.metadata).action}</div>
                      <div>Thử lại: {parseMetadata(r.metadata).retryAfter ?? 0}s</div>
                    </details>
                  </td>
                  <td className="nowrap">{ACTION_TEXT[r.hanhDong] ?? r.hanhDong}</td>
                  <td>{r.emailStatus ?? "Không xếp mail"}</td>
                  <td>{r.review && <small title={r.reviewReason ?? ""}>{r.review}</small>}
                    {r.id && ["SCRAPING", "CLIENT_SCRAPING"].includes(r.loai) && <div className="row">
                      <button className="btn btn-sm" onClick={() => review(r, "TRUE_POSITIVE")}>Đúng</button>
                      <button className="btn btn-sm" onClick={() => review(r, "FALSE_POSITIVE")}>Nhầm</button>
                    </div>}
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

function maskIp(ip: string | null): string {
  if (!ip) return "—";
  return ip.includes(":") ? `${ip.split(":").slice(0, 2).join(":")}:…` : ip.replace(/\.[^.]+$/, ".x");
}
function parseMetadata(value: SecurityEventRow["metadata"]): ScrapingMetadata {
  try { return typeof value === "string" ? JSON.parse(value) : value ?? {}; } catch { return {}; }
}
function ScrapingBlocks({ tick, push }: { tick: number; push: Push }) {
  const [rows, setRows] = useState<ScrapingBlock[]>([]);
  const [refresh, setRefresh] = useState(0);
  const { run, busy } = useAction(push);
  useEffect(() => { api<ScrapingBlock[]>("/api/security/scraping/blocks").then(setRows).catch(() => {}); }, [tick, refresh]);
  const revoke = async (subject: string) => {
    const reason = window.prompt("Lý do bỏ chặn:");
    if (!reason?.trim()) return;
    if (await run(() => api("/api/security/scraping/blocks/revoke", { subject, reason }), "Đã bỏ chặn và đặt lại bộ đếm")) setRefresh(x => x + 1);
  };
  return <Card title="Tạm khóa đọc dữ liệu (không chặn IP chung)">
    {!rows.length ? <Empty>Chưa có tài khoản tạm khóa trên server.</Empty> : <div className="table-wrap"><table>
      <thead><tr><th>Tài khoản</th><th>Hết hạn</th><th>Lý do</th><th>Thao tác</th></tr></thead>
      <tbody>{rows.map(b => <tr key={b.subject}><td>{b.subject}</td><td>{new Date(b.expiresAt).toLocaleString("vi-VN")}</td><td>{b.reason}</td>
        <td><button disabled={busy} className="btn btn-sm" onClick={() => revoke(b.subject)}>Bỏ chặn</button></td></tr>)}</tbody>
    </table></div>}
  </Card>;
}
