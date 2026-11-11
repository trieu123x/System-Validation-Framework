"use client";

import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, fmtMoney, fmtNumber, today } from "@/lib/api";
import type { BusinessBranch, BusinessKpi, BusinessSummary } from "@/lib/types";
import { Badge, Card, Empty, Stat, useAction, type BackAction } from "@/components/ui";
import "./business.css";

type Push = (level: string, text: string) => void;
type Preset = "7d" | "30d" | "month" | "quarter" | "custom";

/** Màu chuỗi: doanh thu = màu nhấn của app, lợi nhuận = cam (cặp đã kiểm tra phân biệt được khi mù màu). */
const REVENUE = "#245bd6";
const PROFIT = "#d9822b";
/** Sell-out (chi nhánh bán cho khách): màu thứ ba, đã kiểm tra phân biệt được với hai màu trên. */
const SELL_OUT = "#1a9b8a";
const GRID = "#e4e9f0";
const AXIS = "#536176";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "7d", label: "7 ngày" },
  { id: "30d", label: "30 ngày" },
  { id: "month", label: "Tháng này" },
  { id: "quarter", label: "Quý này" },
  { id: "custom", label: "Tùy chọn" },
];

/** Chia màn hình thành 3 nhóm để không phải cuộn qua mọi bảng; kỳ và KPI luôn nằm trên cùng. */
type Part = "overview" | "products" | "branches";
const PARTS: { id: Part; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "products", label: "Sản phẩm" },
  { id: "branches", label: "Chi nhánh" },
];

function SeeAll({ onClick }: { onClick: () => void }) {
  return <button type="button" className="btn-link" onClick={onClick}>Xem tất cả →</button>;
}

function presetRange(p: Preset): [string, string] {
  const end = today();
  const [y, m] = end.split("-").map(Number);
  const pad = (x: number) => String(x).padStart(2, "0");
  switch (p) {
    case "7d": return [today(-6), end];
    case "month": return [`${y}-${pad(m)}-01`, end];
    case "quarter": return [`${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, end];
    default: return [today(-29), end];
  }
}

const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const fmtPct = (x: number | null | undefined) =>
  x == null ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const change = (cur: number, prev: number) => (prev === 0 ? null : (cur - prev) / Math.abs(prev));
const shortDate = (iso: string, unit: BusinessSummary["granularity"]) => {
  const [y, m, d] = iso.split("-");
  return unit === "month" ? `${m}/${y}` : `${d}/${m}`;
};
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** % so với kỳ trước; kỳ trước bằng 0 thì "—" thay cho ∞. */
function Delta({ cur, prev, money = true }: { cur: number; prev: number; money?: boolean }) {
  const d = change(cur, prev);
  const title = `Kỳ trước: ${money ? fmtMoney(prev) : fmtNumber(prev)}`;
  if (d == null) return <span className="biz-delta" title={title}>— so kỳ trước</span>;
  const cls = d > 0 ? "biz-delta-up" : d < 0 ? "biz-delta-down" : "";
  return <span className={`biz-delta ${cls}`} title={title}>{d > 0 ? "▲" : d < 0 ? "▼" : "■"} {fmtPct(Math.abs(d))} so kỳ trước</span>;
}

// ---------- CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) ----------

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // chặn chèn công thức khi mở bằng Excel (chỉ với chữ, số âm giữ nguyên)
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // ";" là dấu phân cách cột của Excel ở nhiều locale (kể cả vi-VN): ô có ";" cũng phải đặt trong ngoặc kép
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const text = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ratioCsv = (x: number | null) => (x == null ? "" : Math.round(x * 10000) / 100);

/** Màn hình Kinh doanh: sell-in, lợi nhuận gộp, sell-out, ABC, chỉ số và chỉ tiêu từng chi nhánh. */
export function Business({ version, push, onBackChange }: {
  version: number; push: Push; onBackChange: (back: BackAction | null) => void;
}) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("30d"));
  const [maCn, setMaCn] = useState<string | null>(null);
  const [part, setPart] = useState<Part>("overview");
  const [data, setData] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [mine, setMine] = useState(0);
  const seq = useRef(0);
  const [from, to] = preset === "custom" ? custom : presetRange(preset);

  useEffect(() => {
    onBackChange(maCn ? { label: "Toàn công ty", onClick: () => setMaCn(null) } : null);
    return () => onBackChange(null);
  }, [maCn, onBackChange]);

  useEffect(() => {
    if (!from || !to) return;
    const id = ++seq.current;
    setLoading(true);
    const q = new URLSearchParams({ from, to });
    if (maCn) q.set("maCn", maCn);
    api<BusinessSummary>(`/api/business/summary?${q}`)
      .then((r) => { if (id === seq.current) setData(r); })
      // lỗi (kể cả mất CSDL): giữ số liệu cũ, báo bằng toast
      .catch((e: Error) => { if (id === seq.current) push("error", `Không tải được thống kê: ${e.message}`); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [from, to, maCn, version, mine, push]);

  const reload = useCallback(() => setMine((x) => x + 1), []);
  const branchName = maCn ? data?.branches.find((b) => b.maCn === maCn)?.ten ?? maCn : null;
  const noData = data != null && data.kpi.soPhieu === 0 && data.kpi.sellOutSoLuong === 0;
  const csvName = (kind: string) => `kinh-doanh-${kind}${maCn ? `-${maCn}` : ""}-${data?.from}_${data?.to}.csv`;

  return (
    <div className={`biz ${loading ? "biz-loading" : ""}`}>
      <div className="biz-filters" role="group" aria-label="Kỳ thống kê">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`btn btn-sm ${preset === p.id ? "btn-primary" : ""}`}
            aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
        ))}
        {preset === "custom" && (
          <span className="row">
            <label className="muted">Từ <input type="date" value={custom[0]} max={custom[1] || today()}
              onChange={(e) => setCustom([e.target.value, custom[1]])} /></label>
            <label className="muted">đến <input type="date" value={custom[1]} min={custom[0]} max={today(1)}
              onChange={(e) => setCustom([custom[0], e.target.value])} /></label>
          </span>
        )}
        {data && (
          <span className="muted biz-period">
            {shortDate(data.from, "day")}/{data.from.slice(0, 4)} – {shortDate(data.to, "day")}/{data.to.slice(0, 4)}
            {" · so với "}{shortDate(data.prevFrom, "day")} – {shortDate(data.prevTo, "day")}
          </span>
        )}
        {maCn && (
          <span className="biz-scope">
            <Badge tone="accent">{branchName} · {maCn}</Badge>
            <button type="button" className="btn btn-sm" onClick={() => setMaCn(null)}>← Toàn công ty</button>
          </span>
        )}
      </div>

      {!data ? <Empty>{loading ? "Đang tải thống kê..." : "Chưa có số liệu."}</Empty> : (
        <>
          <Kpis kpi={data.kpi} prev={data.prevKpi} />
          <div className="biz-tabs" role="group" aria-label="Nhóm số liệu">
            {PARTS.map((p) => (
              <button key={p.id} type="button" className="btn"
                aria-pressed={part === p.id} onClick={() => setPart(p.id)}>
                {p.label}{p.id === "products" ? ` (${data.products.length})` : p.id === "branches" && !maCn ? ` (${data.branches.length})` : ""}
              </button>
            ))}
          </div>

          {/* Tổng quan: xu hướng + top 5, mỗi khối có lối sang tab đầy đủ */}
          {part === "overview" && (noData ? <Card><Empty>Chưa có giao dịch trong kỳ.</Empty></Card> : <>
            <TrendChart data={data} />
            <div className="grid grid-2">
              <Card title="Top 5 sản phẩm theo doanh thu" actions={<SeeAll onClick={() => setPart("products")} />}>
                <HorizontalBars rows={data.products.slice(0, 5).map((p) => ({ ten: p.ten, doanhThu: p.doanhThu }))} />
              </Card>
              {maCn ? (
                <Card title="Doanh thu theo danh mục" actions={<SeeAll onClick={() => setPart("products")} />}>
                  <HorizontalBars rows={data.categories.filter((c) => c.doanhThu > 0).slice(0, 5).map((c) => ({ ten: c.ten, doanhThu: c.doanhThu }))} />
                </Card>
              ) : (
                <BranchChart rows={data.branches.slice(0, 5)} title="Top 5 chi nhánh" actions={<SeeAll onClick={() => setPart("branches")} />} />
              )}
            </div>
          </>)}

          {part === "products" && (noData ? <Card><Empty>Chưa có giao dịch trong kỳ.</Empty></Card> : <>
            <div className="grid grid-2">
              <Card title="Top 10 sản phẩm theo doanh thu">
                <HorizontalBars rows={data.products.slice(0, 10).map((p) => ({ ten: p.ten, doanhThu: p.doanhThu }))} />
              </Card>
              <Card title="Doanh thu theo danh mục">
                <HorizontalBars rows={data.categories.filter((c) => c.doanhThu > 0).map((c) => ({ ten: c.ten, doanhThu: c.doanhThu }))} />
              </Card>
            </div>
            <ProductTable data={data} onCsv={() => downloadCsv(csvName("san-pham"),
              ["Mã hàng", "Tên hàng", "Danh mục", "Số lượng", "Doanh thu", "Lợi nhuận gộp", "Tỷ trọng %", "Nhóm ABC"],
              data.products.map((p) => [p.maSp, p.ten, p.maDm, p.soLuong, p.doanhThu, p.loiNhuan, ratioCsv(p.tyTrong), p.abc]))} />
          </>)}

          {part === "branches" && <>
          {!noData && !maCn && <BranchChart rows={data.branches} title="Doanh thu theo chi nhánh" />}
          <BranchTable rows={data.branches} drilled={maCn != null} push={push} changed={reload}
            onOpen={(id) => { setMaCn(id); setPart("overview"); }}
            onCsv={() => downloadCsv(csvName("chi-nhanh"),
              ["Mã CN", "Tên chi nhánh", "Doanh thu", "Doanh thu kỳ trước", "Lợi nhuận gộp",
                "Bán ra SL", "Doanh thu bán ra", "Doanh thu bán ra kỳ trước", "Tháng chỉ tiêu", "Chỉ tiêu",
                "Doanh thu tháng", "Hoàn thành %", "Dự kiến cuối tháng", "Sell-through %", "Số ngày tồn", "Công nợ",
                "Hạn mức", "Đáp ứng %", "Trả hàng %", "Ngày từ lần nhập cuối", "Ngừng nhập"],
              data.branches.map((b) => [b.maCn, b.ten, b.doanhThu, b.doanhThuTruoc, b.loiNhuan,
                b.sellOutSoLuong, b.sellOutDoanhThu, b.sellOutTruoc, b.thang, b.chiTieu ?? "",
                b.doanhThuThang, ratioCsv(b.hoanThanh), b.duKien ?? "", ratioCsv(b.sellThrough),
                b.ngayTon == null ? "" : Math.round(b.ngayTon), b.congNo, b.hanMuc, ratioCsv(b.dapUng), ratioCsv(b.traHang),
                b.ngayTuLanNhapCuoi ?? "", b.ngungNhap ? "Có" : ""]))} />
          </>}
        </>
      )}
    </div>
  );
}

function Kpis({ kpi, prev }: { kpi: BusinessKpi; prev: BusinessKpi }) {
  return (
    <div className="kpis biz-kpis">
      <Stat label="Doanh thu sell-in" value={fmtMoney(kpi.doanhThu)} hint={<Delta cur={kpi.doanhThu} prev={prev.doanhThu} />} />
      <Stat label="Lợi nhuận gộp" value={fmtMoney(kpi.loiNhuan)} tone={kpi.loiNhuan < 0 ? "danger" : undefined}
        hint={<Delta cur={kpi.loiNhuan} prev={prev.loiNhuan} />} />
      <Stat label="Biên lợi nhuận" value={fmtPct(kpi.bienLoiNhuan)} tone={(kpi.bienLoiNhuan ?? 0) < 0 ? "danger" : undefined}
        hint={<span className="biz-delta">kỳ trước {fmtPct(prev.bienLoiNhuan)}</span>} />
      <Stat label="Số phiếu xuất" value={fmtNumber(kpi.soPhieu)} hint={<Delta cur={kpi.soPhieu} prev={prev.soPhieu} money={false} />} />
      <Stat label="Trung bình / phiếu" value={fmtMoney(kpi.tbPhieu)} hint={<Delta cur={kpi.tbPhieu} prev={prev.tbPhieu} />} />
      <Stat label="Doanh thu sell-out" value={fmtMoney(kpi.sellOutDoanhThu)}
        hint={<>
          <Delta cur={kpi.sellOutDoanhThu} prev={prev.sellOutDoanhThu} />
          {kpi.sellOutUocTinh > 0 && <span className="biz-delta" title="Dòng bán cũ chưa lưu giá, tính theo giá bán lẻ hiện tại">
            {" · "}{fmtNumber(kpi.sellOutUocTinh)} dòng ước tính</span>}
        </>} />
    </div>
  );
}

const moneyTip = (v: unknown) => fmtMoney(Number(v));

function TrendChart({ data }: { data: BusinessSummary }) {
  const unit = { day: "ngày", week: "tuần", month: "tháng" }[data.granularity];
  return (
    <Card title={<>Xu hướng doanh thu và lợi nhuận <span className="muted">· theo {unit}</span></>} className="biz-card">
      <div className="biz-chart" role="img" aria-label={`Biểu đồ đường doanh thu và lợi nhuận gộp theo ${unit}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="moc" tickFormatter={(v: string) => shortDate(v, data.granularity)} stroke={AXIS}
              tick={{ fontSize: 12 }} tickLine={false} minTickGap={16} />
            <YAxis tickFormatter={(v: number) => compact.format(v)} stroke={AXIS} tick={{ fontSize: 12 }}
              tickLine={false} axisLine={false} width={56} />
            <Tooltip formatter={moneyTip}
              // tuần đầu có thể bắt đầu trước kỳ (mốc thứ Hai): nhãn lấy ngày muộn hơn giữa mốc và `from`
              labelFormatter={(v) => (data.granularity === "week"
                ? `Tuần từ ${shortDate(String(v) < data.from ? data.from : String(v), "day")}`
                : shortDate(String(v), data.granularity))} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5 }} />
            <Line type="monotone" dataKey="doanhThu" name="Doanh thu" stroke={REVENUE} strokeWidth={2}
              dot={data.trend.length <= 12 ? { r: 4 } : false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="loiNhuan" name="Lợi nhuận gộp" stroke={PROFIT} strokeWidth={2}
              dot={data.trend.length <= 12 ? { r: 4 } : false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function HorizontalBars({ rows }: { rows: { ten: string; doanhThu: number }[] }) {
  if (rows.length === 0) return <Empty>Chưa có doanh thu.</Empty>;
  return (
    <div className="biz-bars" style={{ height: Math.max(120, rows.length * 30 + 30) }}
      role="img" aria-label={rows.map((r) => `${r.ten}: ${fmtMoney(r.doanhThu)}`).join("; ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
          <YAxis type="category" dataKey="ten" width={150} tickFormatter={(v: string) => clip(v)} stroke={AXIS}
            tick={{ fontSize: 12 }} tickLine={false} />
          <Tooltip formatter={moneyTip} cursor={{ fill: "#f4f7fd" }} />
          <Bar dataKey="doanhThu" name="Doanh thu" fill={REVENUE} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const ABC_TONE: Record<string, string> = { A: "success", B: "info", C: "muted" };

function ProductTable({ data, onCsv }: { data: BusinessSummary; onCsv: () => void }) {
  return (
    <div className="grid biz-products">
      <Card title={<>Sản phẩm <span className="muted">· {data.products.length} mặt hàng có doanh thu</span></>}
        actions={<button type="button" className="btn btn-sm" onClick={onCsv} disabled={data.products.length === 0}>Xuất CSV</button>}>
        {data.products.length === 0 ? <Empty>Chưa có doanh thu.</Empty> : (
          <div className="table-wrap" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th className="num">#</th><th>Mặt hàng</th><th className="num">Số lượng</th><th className="num">Doanh thu</th>
                  <th className="num">Lợi nhuận gộp</th><th className="num">Tỷ trọng</th><th title="Phân nhóm theo doanh thu cộng dồn">ABC</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p, i) => (
                  <tr key={p.maSp}>
                    <td className="num muted">{i + 1}</td>
                    <td><strong>{p.ten}</strong> <span className="muted">{p.maSp}</span></td>
                    <td className="num">{fmtNumber(p.soLuong)}</td>
                    <td className="num">{fmtMoney(p.doanhThu)}</td>
                    <td className={`num ${p.loiNhuan < 0 ? "biz-neg" : ""}`}>{fmtMoney(p.loiNhuan)}</td>
                    <td className="num">{fmtPct(p.tyTrong)}</td>
                    <td><Badge tone={ABC_TONE[p.abc]}>{p.abc}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={<>Không bán trong kỳ <span className="muted">· {data.khongBan.length} mặt hàng</span></>}>
        {data.khongBan.length === 0 ? <Empty>Mặt hàng nào cũng có doanh thu.</Empty> : (
          <div className="table-wrap" tabIndex={0}>
            <table>
              <thead><tr><th>Mặt hàng</th><th className="num">{data.maCn ? "Tồn chi nhánh" : "Tồn kho tổng"}</th></tr></thead>
              <tbody>
                {data.khongBan.map((p) => (
                  <tr key={p.maSp}>
                    <td>{p.ten} <span className="muted">{p.maSp}</span></td>
                    <td className="num">{fmtNumber(p.tonTong)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** % so kỳ trước dạng chữ có màu; kỳ trước bằng 0 thì "—". */
function ChangeText({ cur, prev }: { cur: number; prev: number }) {
  const d = change(cur, prev);
  if (d == null) return <span className="muted" title="Kỳ trước bằng 0">—</span>;
  return <span className={d < 0 ? "biz-neg" : d > 0 ? "biz-pos" : ""} title={`Kỳ trước: ${fmtMoney(prev)}`}>
    {`${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtPct(Math.abs(d))}`}
  </span>;
}

/** So sánh chi nhánh: sell-in (công ty xuất cho chi nhánh) cạnh sell-out (chi nhánh bán cho khách). */
function BranchChart({ rows, title, actions }: { rows: BusinessBranch[]; title: string; actions?: ReactNode }) {
  const data = rows.map((b) => ({ ten: b.ten, maCn: b.maCn, doanhThu: b.doanhThu, sellOut: b.sellOutDoanhThu }));
  return (
    <Card title={<>{title} <span className="muted">· sell-in và bán ra</span></>} actions={actions}>
      <div className="biz-bars" style={{ height: Math.max(160, data.length * 34 + 50) }}
        role="img" aria-label={data.map((b) => `${b.ten}: nhập ${fmtMoney(b.doanhThu)}, bán ra ${fmtMoney(b.sellOut)}`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8} barGap={2}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis type="category" dataKey="ten" width={170} tickFormatter={(v: string) => clip(v.replace(/^Chi nhánh /, ""), 24)}
              stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
            <Tooltip formatter={moneyTip} cursor={{ fill: "#f4f7fd" }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Bar dataKey="doanhThu" name="Sell-in (công ty xuất)" fill={REVENUE} radius={[0, 4, 4, 0]} maxBarSize={11} />
            <Bar dataKey="sellOut" name="Bán ra (sell-out)" fill={SELL_OUT} radius={[0, 4, 4, 0]} maxBarSize={11} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function BranchTable({ rows, drilled, push, changed, onOpen, onCsv }: {
  rows: BusinessBranch[]; drilled: boolean; push: Push; changed: () => void; onOpen: (maCn: string) => void; onCsv: () => void;
}) {
  const month = rows[0]?.thang;
  return (
    <Card title={<>Chi nhánh <span className="muted">· {drilled ? "chi tiết" : `${rows.length} chi nhánh, xếp theo doanh thu`}</span></>}
      actions={<button type="button" className="btn btn-sm" onClick={onCsv} disabled={rows.length === 0}>Xuất CSV</button>}>
      {rows.length === 0 ? <Empty>Chưa có chi nhánh.</Empty> : (
        <div className="table-wrap" tabIndex={0}>
          <table className="biz-branches">
            <thead>
              <tr>
                <th>Chi nhánh</th><th className="num" title="Công ty xuất cho chi nhánh (sell-in)">Doanh thu</th><th className="num">So kỳ trước</th>
                <th className="num" title="Chi nhánh bán cho khách (sell-out)">Bán ra</th>
                <th className="num" title="Bấm để sửa; Enter hoặc rời ô để lưu, Esc để huỷ, để trống để xoá">Chỉ tiêu {month && `T${month.slice(5)}/${month.slice(0, 4)}`}</th>
                <th className="num">Hoàn thành</th><th className="num">Dự kiến</th>
                <th className="num" title="Bán ra / (bán ra + tồn hiện tại)">Sell-through</th><th className="num">Ngày tồn</th>
                <th className="num">Nợ / hạn mức</th><th className="num">Đáp ứng</th><th className="num">Trả hàng</th>
                <th className="num">Nhập cuối</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const over = b.congNo > b.hanMuc;
                return (
                  <tr key={b.maCn} className={drilled ? "" : "biz-row"} onClick={drilled ? undefined : () => onOpen(b.maCn)}>
                    <td>
                      {drilled ? <strong>{b.ten}</strong> : (
                        <button type="button" className="btn-link" onClick={(e) => { e.stopPropagation(); onOpen(b.maCn); }}>{b.ten}</button>
                      )} <span className="muted">{b.maCn}</span>
                    </td>
                    <td className="num">{fmtMoney(b.doanhThu)}</td>
                    <td className="num"><ChangeText cur={b.doanhThu} prev={b.doanhThuTruoc} /></td>
                    <td className="num">
                      {fmtMoney(b.sellOutDoanhThu)}
                      <small className="biz-sub">SL {fmtNumber(b.sellOutSoLuong)} · <ChangeText cur={b.sellOutDoanhThu} prev={b.sellOutTruoc} /></small>
                    </td>
                    <td className="num biz-target-cell" onClick={(e) => e.stopPropagation()}>
                      <TargetCell branch={b} push={push} changed={changed} />
                    </td>
                    <td className="num">{fmtPct(b.hoanThanh)}</td>
                    <td className="num">{fmtMoney(b.duKien)}</td>
                    <td className="num">{fmtPct(b.sellThrough)}</td>
                    <td className="num">{b.ngayTon == null ? "—" : fmtNumber(Math.round(b.ngayTon))}</td>
                    <td className={`num ${over ? "biz-neg" : ""}`}>{compact.format(b.congNo)} / {compact.format(b.hanMuc)}</td>
                    <td className="num">{fmtPct(b.dapUng)}</td>
                    <td className="num">{fmtPct(b.traHang)}</td>
                    <td className="num">{b.ngayTuLanNhapCuoi == null ? "—" : `${b.ngayTuLanNhapCuoi} ngày`}</td>
                    <td className="biz-flags">
                      {b.ngungNhap && <Badge tone="warn">Ngừng nhập</Badge>}
                      {over && <Badge tone="danger">Vượt hạn mức</Badge>}
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

/** Ô chỉ tiêu sửa tại chỗ: Enter/rời ô để lưu, Esc để huỷ; để trống hoặc 0 thì xoá chỉ tiêu. */
function TargetCell({ branch, push, changed }: { branch: BusinessBranch; push: Push; changed: () => void }) {
  const { run, busy } = useAction(push);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const settled = useRef(false);

  const open = () => {
    settled.current = false;
    setValue(branch.chiTieu == null ? "" : String(branch.chiTieu));
    setEditing(true);
  };
  const save = async () => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const soTien = Number(value.replace(/[^\d]/g, "") || "0");
    if (soTien === (branch.chiTieu ?? 0)) return;
    const ok = await run(() => api(`/api/business/targets/${encodeURIComponent(branch.maCn)}`,
      { thang: branch.thang, soTien }, "PUT"), soTien === 0 ? `Đã xoá chỉ tiêu ${branch.maCn}` : `Đã lưu chỉ tiêu ${branch.maCn}`);
    if (ok) changed();
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void save(); }
    if (e.key === "Escape") { settled.current = true; setEditing(false); }
  };

  if (editing) {
    return <input className="biz-target-input" autoFocus inputMode="numeric" value={value} aria-label={`Chỉ tiêu tháng ${branch.thang} của ${branch.ten}`}
      onChange={(e) => setValue(e.target.value)} onKeyDown={key} onBlur={() => void save()} placeholder="0 = xoá" />;
  }
  return (
    <button type="button" className="biz-target" onClick={open} disabled={busy} title="Bấm để sửa chỉ tiêu tháng">
      {branch.chiTieu == null ? <span className="muted">Đặt chỉ tiêu</span> : fmtMoney(branch.chiTieu)}
    </button>
  );
}
