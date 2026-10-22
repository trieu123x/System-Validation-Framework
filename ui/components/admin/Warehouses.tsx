"use client";

import { Fragment, useEffect, useState } from "react";
import { api, confirmCredit, fmtMoney, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Product, Warehouse, WarehouseDetail, WarehouseItem } from "@/lib/types";
import { Badge, Card, Dot, Empty, LEVEL_LABEL, ProductImage, StockBar, stockLevel, useAction, type StockLevel } from "@/components/ui";

type Push = (l: string, t: string) => void;
type Sort = "thieu" | "giaTriTon" | "conNo" | "maCn";
type FlatRow = { maCn: string; tenCn: string; maSp: string; tenSp: string; soLuong: number; nguongToiThieu: number };

const LEVEL_TONE: Record<StockLevel, string> = { critical: "danger", warning: "warn", ok: "success", unset: "muted" };

/** Quản lý kho chi nhánh: lưới thẻ mỗi chi nhánh một thẻ, bấm vào xem chi tiết; hoặc ma trận mặt hàng × chi nhánh. */
export function Warehouses({ products, version, push }: { products: Product[]; version: number; push: Push }) {
  const [view, setView] = useState<"cards" | "matrix">("cards");
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [sort, setSort] = useState<Sort>("thieu");
  const [sel, setSel] = useState<string | null>(null);
  const [mine, setMine] = useState(0);

  useEffect(() => {
    api<Warehouse[]>("/api/warehouses").then(setRows).catch(() => {});
  }, [version, mine]);

  if (sel) {
    return <WarehouseView maCn={sel} version={version + mine} push={push} back={() => setSel(null)}
      changed={() => setMine((x) => x + 1)} />;
  }

  const sorted = [...rows].sort((a, b) => sort === "maCn" ? a.maCn.localeCompare(b.maCn)
    : sort === "thieu" ? b.thieu - a.thieu || b.sapThieu - a.sapThieu : b[sort] - a[sort]);

  return (
    <>
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

function WarehouseView({ maCn, version, push, back, changed }: {
  maCn: string; version: number; push: Push; back: () => void; changed: () => void;
}) {
  const [d, setD] = useState<WarehouseDetail | null>(null);
  const [level, setLevel] = useState<"" | StockLevel>("");

  useEffect(() => {
    api<WarehouseDetail>(`/api/warehouses/${encodeURIComponent(maCn)}`).then(setD).catch(() => setD(null));
  }, [maCn, version]);

  if (!d) return <Card><Empty>Đang tải kho {maCn}...</Empty></Card>;
  const count = (l: StockLevel) => d.matHang.filter((m) => m.muc === l).length;
  const shown = level ? d.matHang.filter((m) => m.muc === level) : d.matHang;
  const groups = [...new Set(shown.map((m) => m.tenDm))];
  const over = d.conNo > d.hanMuc;

  return (
    <Card title={<><Dot on={d.online} />Kho {d.maCn} <span className="muted">· {d.ten}{d.diaChi ? `, ${d.diaChi}` : ""}</span></>}
      actions={<button className="btn btn-sm" onClick={back}>← Tất cả chi nhánh</button>}>
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
                <th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th className="num">Ngưỡng</th><th>Mức tồn</th>
                <th className="num">Bán 7 ngày</th><th className="num">Giá trị</th><th>YC đang mở</th><th>Bổ sung</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr><td colSpan={9} style={{ background: "var(--surface-2)", fontWeight: 600 }}>{g}</td></tr>
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
  // YC CHO/DA_DE_XUAT vẫn bổ sung được (server gửi hàng cho chính YC đó); đang giao hoặc báo thiếu thì không
  const blocked = m.ycTrangThai != null && !["CHO", "DA_DE_XUAT"].includes(m.ycTrangThai);

  const replenish = async () => {
    if (!(await confirmCredit(maCn, n * m.giaXuat))) return;
    if (await run(() => api(`/api/warehouses/${encodeURIComponent(maCn)}/replenish`, { maSp: m.maSp, soLuong: n }),
      `Đã gửi ${n} ${m.ten} tới ${maCn}`)) {
      changed();
    }
  };

  // sắp thiếu (chưa dưới ngưỡng): hỏi chi nhánh trước, CN bấm "Cần hàng" thì server tạo YC
  const ask = () => run(() => api("/api/notices", {
    loai: "HOI_NHU_CAU", tieuDe: `Chi nhánh có cần thêm ${m.ten}?`,
    noiDung: `Tồn hiện tại ${m.soLuong}, ngưỡng ${m.nguong}. Công ty đề xuất bổ sung ${n} ${m.donVi}.`,
    maSp: m.maSp, soLuongDeXuat: n, chiNhanh: [{ maCn, deXuat: n }],
  }), `Đã hỏi ${maCn} có cần thêm ${m.ten} không`);

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
      <td className="num">{m.nguong ? fmtNumber(m.nguong) : "—"}</td>
      <td className="nowrap">
        <StockBar soLuong={m.soLuong} nguong={m.nguong} />
        {m.muc !== "ok" && <Badge tone={LEVEL_TONE[m.muc]}>{LEVEL_LABEL[m.muc]}</Badge>}
      </td>
      <td className="num">{fmtNumber(m.ban7Ngay)}</td>
      <td className="num nowrap">{fmtMoney(m.giaTri)}</td>
      <td className="nowrap">{m.ycMo != null && <>YC{m.ycMo} <Badge tone="info">{STATE_LABEL[m.ycTrangThai ?? ""] ?? m.ycTrangThai}</Badge></>}</td>
      <td className="nowrap">
        {needs && !blocked && (
          <span className="qty-group">
            <input type="number" min={1} value={qty} style={{ height: 26, width: 60 }} onChange={(e) => setQty(e.target.value)}
              aria-label={`Số lượng bổ sung ${m.maSp}`} />
            <button className="btn btn-sm btn-success" disabled={busy || !(n > 0) || m.tonTong < n}
              title={m.tonTong < n ? `Kho tổng chỉ còn ${m.tonTong}` : "Tạo yêu cầu và gửi hàng ngay"}
              onClick={replenish}>Bổ sung</button>
            {m.muc === "warning" && m.ycMo == null && (
              <button className="btn btn-sm" disabled={busy || !(n > 0)} onClick={ask}
                title="Gửi thông báo hỏi chi nhánh có cần hàng không">Hỏi cần hàng</button>
            )}
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
