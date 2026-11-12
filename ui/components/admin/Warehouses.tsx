"use client";

import { Fragment, useEffect, useState } from "react";
import { api, fmtMoney, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Product, Warehouse, WarehouseDetail, WarehouseItem } from "@/lib/types";
import { Badge, Card, Dot, Empty, LEVEL_LABEL, ProductImage, StockBar, stockLevel, useAction, type StockLevel, type BackAction } from "@/components/ui";
import { RequestShipment } from "./RequestShipment";

type Push = (l: string, t: string) => void;
type Sort = "thieu" | "giaTriTon" | "conNo" | "maCn";
type FlatRow = { maCn: string; tenCn: string; maSp: string; tenSp: string; soLuong: number; nguongToiThieu: number };

const LEVEL_TONE: Record<StockLevel, string> = { critical: "danger", warning: "warn", ok: "success", unset: "muted" };

/** Quản lý kho chi nhánh: lưới thẻ mỗi chi nhánh một thẻ, bấm vào xem chi tiết; hoặc ma trận mặt hàng × chi nhánh. */
export function Warehouses({ products, version, push, onBackChange }: { products: Product[]; version: number; push: Push; onBackChange: (back: BackAction | null) => void }) {
  const [view, setView] = useState<"cards" | "matrix">("cards");
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [sort, setSort] = useState<Sort>("thieu");
  const [sel, setSel] = useState<string | null>(null);
  const [mine, setMine] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    onBackChange(sel ? { label: "Tất cả chi nhánh", onClick: () => setSel(null) } : null);
    return () => onBackChange(null);
  }, [sel, onBackChange]);

  useEffect(() => {
    let active = true;
    api<Warehouse[]>("/api/warehouses").then((data) => { if (active) { setRows(data); setError(""); } })
      .catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [version, mine]);

  if (sel) {
    return <WarehouseView maCn={sel} version={version + mine} push={push}
      changed={() => setMine((x) => x + 1)} />;
  }

  const sorted = [...rows].sort((a, b) => sort === "maCn" ? a.maCn.localeCompare(b.maCn)
    : sort === "thieu" ? b.thieu - a.thieu || b.sapThieu - a.sapThieu : b[sort] - a[sort]);

  return (
    <>
      {error && <div className="banner banner-danger" role="alert">Không tải được danh sách kho: {error}<button type="button" className="btn btn-sm" onClick={() => setMine((value) => value + 1)} style={{ marginLeft: 10 }}>Thử lại</button></div>}
      <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn ${view === "cards" ? "btn-primary" : ""}`} onClick={() => setView("cards")}>Thẻ chi nhánh</button>
          <button className={`btn ${view === "matrix" ? "btn-primary" : ""}`} onClick={() => setView("matrix")}>Ma trận</button>
        </div>
        {view === "cards" && (
          <label className="row muted">Sắp xếp
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="thieu">Nhiều mặt hàng thiếu nhất</option>
              <option value="giaTriTon">Giá trị tồn cao nhất</option>
              <option value="conNo">Còn nợ nhiều nhất</option>
              <option value="maCn">Mã chi nhánh</option>
            </select>
          </label>
        )}
      </div>
      {view === "matrix" ? <Matrix products={products} version={version + mine} open={setSel} /> : (
        rows.length === 0 ? <Card><Empty>Chưa có chi nhánh nào.</Empty></Card> : (
          <div className="wh-grid">
            {sorted.map((w) => (
              <button key={w.maCn} type="button" className={`wh-card ${w.thieu > 0 || w.vuotHanMuc ? "wh-alert" : ""}`}
                onClick={() => setSel(w.maCn)}>
                <h3><Dot on={w.online} />{w.maCn} <span className="muted" style={{ fontWeight: 400 }}>{w.ten}</span></h3>
                <div className="wh-nums">
                  <div><b className={w.thieu ? "lv-critical" : ""}>{w.thieu}</b><span>thiếu</span></div>
                  <div><b className={w.sapThieu ? "lv-warning" : ""}>{w.sapThieu}</b><span>sắp thiếu</span></div>
                  <div><b className="lv-ok">{w.du}</b><span>đủ</span></div>
                  <div><b>{w.chuaDat}</b><span>chưa đặt</span></div>
                </div>
                <div className="wh-meta"><span>Giá trị tồn</span><b>{fmtMoney(w.giaTriTon)}</b></div>
                <div className="wh-meta">
                  <span>Còn nợ{w.vuotHanMuc && " (vượt hạn mức)"}</span>
                  <b className={w.vuotHanMuc ? "lv-critical" : ""}>{fmtMoney(w.conNo)}</b>
                </div>
                <div className="wh-meta"><span>YC đang mở</span><b>{w.ycMo}</b></div>
              </button>
            ))}
          </div>
        )
      )}
    </>
  );
}

function WarehouseView({ maCn, version, push, changed }: {
  maCn: string; version: number; push: Push; changed: () => void;
}) {
  const [d, setD] = useState<WarehouseDetail | null>(null);
  const [level, setLevel] = useState<"" | StockLevel>("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    api<WarehouseDetail>(`/api/warehouses/${encodeURIComponent(maCn)}`).then((data) => { if (active) setD(data); })
      .catch((failure: Error) => { if (active) { setD(null); setError(failure.message); } });
    return () => { active = false; };
  }, [maCn, version, reload]);

  if (!d) return <Card>{error ? <div className="banner banner-danger" role="alert">Không tải được kho {maCn}: {error}<button type="button" className="btn btn-sm" onClick={() => setReload((value) => value + 1)} style={{ marginLeft: 10 }}>Thử lại</button></div> : <Empty>Đang tải kho {maCn}...</Empty>}</Card>;
  const count = (l: StockLevel) => d.matHang.filter((m) => m.muc === l).length;
  const shown = level ? d.matHang.filter((m) => m.muc === level) : d.matHang;
  const groups = [...new Set(shown.map((m) => m.tenDm))];
  const over = d.conNo > d.hanMuc;

  return (
    <Card title={<><Dot on={d.online} />Kho {d.maCn} <span className="muted">· {d.ten}{d.diaChi ? `, ${d.diaChi}` : ""}</span></>}>
      <div className="row" style={{ marginBottom: 10 }}>
        {(["", "critical", "warning", "ok", "unset"] as const).map((l) => (
          <button key={l} className={`btn btn-sm ${level === l ? "btn-primary" : ""}`} onClick={() => setLevel(l)}>
            {l ? `${LEVEL_LABEL[l]} (${count(l)})` : `Tất cả (${d.matHang.length})`}
          </button>
        ))}
        <span className="muted" style={{ marginLeft: "auto" }}>
          Còn nợ <b className={over ? "lv-critical" : ""}>{fmtMoney(d.conNo)}</b> / hạn mức {fmtMoney(d.hanMuc)}
        </span>
      </div>
      {shown.length === 0 ? <Empty>Không có mặt hàng nào ở mức này.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th>Mức tồn</th>
                <th className="num">Số lượng bán (7 ngày)</th><th className="num">Giá trị</th><th>YC đang mở</th><th>Số lượng bổ sung</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr><td colSpan={8} style={{ background: "var(--surface-2)", fontWeight: 600 }}>{g}</td></tr>
                  {shown.filter((m) => m.tenDm === g).map((m) => (
                    <ItemRow key={m.maSp} maCn={d.maCn} m={m} push={push} changed={changed} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ItemRow({ maCn, m, push, changed }: { maCn: string; m: WarehouseItem; push: Push; changed: () => void }) {
  const { run, busy } = useAction(push);
  const [qty, setQty] = useState(String(Math.max(m.deXuat, 1)));
  useEffect(() => setQty(String(Math.max(m.deXuat, 1))), [m.deXuat]);
  const n = Number(qty);
  const needs = m.muc === "critical" || m.muc === "warning";
  // Chỉ tạo/đổi yêu cầu khi chi nhánh chưa chấp nhận; chưa xuất kho tại bước này.
  const blocked = m.ycTrangThai != null && !["CHO", "DA_DE_XUAT"].includes(m.ycTrangThai);

  const replenish = async () => {
    if (await run(() => api(`/api/warehouses/${encodeURIComponent(maCn)}/replenish`, { maSp: m.maSp, soLuong: n }),
      `Đã yêu cầu ${maCn} chấp nhận bổ sung ${n} ${m.ten}`)) {
      changed();
    }
  };

  return (
    <tr className={m.muc === "critical" ? "low" : m.muc === "warning" ? "warn" : ""}>
      <td className="code">{m.maSp}</td>
      <td>
        <div className="with-thumb">
          <ProductImage src={m.anhUrl} alt={m.ten} category={m.tenDm} size={32} />
          <span>{m.ten}{m.model && <span className="muted"> · {m.model}</span>}</span>
        </div>
      </td>
      <td className="num"><b>{fmtNumber(m.soLuong)}</b></td>
      <td className="nowrap">
        <StockBar soLuong={m.soLuong} nguong={m.nguong} />
        {m.muc !== "ok" && <Badge tone={LEVEL_TONE[m.muc]}>{LEVEL_LABEL[m.muc]}</Badge>}
      </td>
      <td className="num">{fmtNumber(m.ban7Ngay)}</td>
      <td className="num nowrap">{fmtMoney(m.giaTri)}</td>
      <td className="nowrap">{m.ycMo != null && <>YC{m.ycMo} <Badge tone="info">{STATE_LABEL[m.ycTrangThai ?? ""] ?? m.ycTrangThai}</Badge></>}</td>
      <td className="nowrap">
        {m.ycMo != null && m.ycTrangThai === "DA_CHAP_NHAN" && <RequestShipment
          request={{ maYc: m.ycMo, maCn, trangThai: m.ycTrangThai, soLuongChot: m.ycSoLuongChot, tonTong: m.tonTong, giaXuat: m.giaXuat }}
          push={push} label="Xuất kho" onShipped={changed} />}
        {needs && !blocked && (
          <span className="qty-group">
            <input type="number" min={1} value={qty} style={{ height: 26, width: 60 }} onChange={(e) => setQty(e.target.value)}
              aria-label={`Số lượng bổ sung ${m.maSp}`} />
            <button className="btn btn-sm btn-success" disabled={busy || !Number.isSafeInteger(n) || n <= 0}
              title="Gửi yêu cầu để chi nhánh chấp nhận trước khi xuất hàng"
              onClick={replenish}>Yêu cầu bổ sung</button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Hàng là mặt hàng, cột là chi nhánh; ô tô màu theo mức tồn để tìm mặt hàng thiếu ở nhiều nơi. */
function Matrix({ products, version, open }: { products: Product[]; version: number; open: (maCn: string) => void }) {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [onlyShort, setOnlyShort] = useState(true);

  useEffect(() => {
    api<FlatRow[]>("/api/stock/branches").then(setRows).catch(() => {});
  }, [version]);

  const branches = [...new Map(rows.map((r) => [r.maCn, r.tenCn])).entries()];
  const cell = new Map(rows.map((r) => [`${r.maCn}|${r.maSp}`, r]));
  const shortCount = (maSp: string) => rows.filter((r) => r.maSp === maSp && stockLevel(r.soLuong, r.nguongToiThieu) === "critical").length;
  const shown = products.filter((p) => !onlyShort || shortCount(p.maSp) > 0)
    .sort((a, b) => shortCount(b.maSp) - shortCount(a.maSp) || a.maSp.localeCompare(b.maSp));

  return (
    <Card title={<>Ma trận tồn kho <span className="muted">· {shown.length} mặt hàng × {branches.length} chi nhánh</span></>}
      actions={(
        <label className="row muted">
          <input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} /> Chỉ mặt hàng đang thiếu
        </label>
      )}>
      {shown.length === 0 ? <Empty>Không có mặt hàng nào đang thiếu.</Empty> : (
        <div className="table-wrap scroll" style={{ maxHeight: 640 }}>
          <table className="matrix">
            <thead>
              <tr>
                <th>Mặt hàng</th><th className="num">Thiếu ở</th>
                {branches.map(([ma, ten]) => <th key={ma} className="mx-head" title={ten}>{ma}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.maSp}>
                  <td className="nowrap"><span className="code">{p.maSp}</span> {p.ten}</td>
                  <td className="num">{shortCount(p.maSp)}</td>
                  {branches.map(([ma, ten]) => {
                    const r = cell.get(`${ma}|${p.maSp}`);
                    const l = r ? stockLevel(r.soLuong, r.nguongToiThieu) : "unset";
                    return (
                      <td key={ma} className={`mx mx-${l}`} onClick={() => open(ma)}
                        title={`${ten} · ${p.ten}: tồn ${r?.soLuong ?? 0} / ngưỡng ${r?.nguongToiThieu ?? 0} (${LEVEL_LABEL[l]})`}>
                        {r?.soLuong ?? 0}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
