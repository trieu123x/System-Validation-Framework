"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Branch, Product, RequestRow, TransferRow } from "@/lib/types";
import {
  Badge, Card, Empty, Facet, FilterGroup, LEVEL_LABEL, StateBadge, StockBar, stockLevel, type StockLevel,
} from "@/components/ui";

type StockRow = {
  maCn: string; tenCn: string; maSp: string; tenSp: string; soLuong: number; nguongToiThieu: number; duoiNguong: boolean;
};

type LevelFilter = "all" | "critical" | "warning" | "unset";

/** FR-09: tồn kho từng chi nhánh, lọc theo mức tồn. */
export function BranchStock({ branches, version }: { branches: Branch[]; version: number }) {
  const [maCn, setMaCn] = useState("");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [rows, setRows] = useState<StockRow[]>([]);

  useEffect(() => {
    api<StockRow[]>(`/api/stock/branches?maCn=${encodeURIComponent(maCn)}`).then(setRows).catch(() => {});
  }, [maCn, version]);

  const count = (l: StockLevel) => rows.filter((r) => stockLevel(r.soLuong, r.nguongToiThieu) === l).length;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (level === "all" || stockLevel(r.soLuong, r.nguongToiThieu) === level)
    && (!needle || `${r.maCn} ${r.tenCn} ${r.maSp} ${r.tenSp}`.toLowerCase().includes(needle)));

  return (
    <div className="listpage">
      <aside className="filters">
        <FilterGroup title="Tìm kiếm">
          <input type="search" placeholder="Mã, tên chi nhánh / hàng" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Tìm kiếm" />
        </FilterGroup>
        <FilterGroup title="Chi nhánh">
          <select value={maCn} onChange={(e) => setMaCn(e.target.value)} aria-label="Lọc chi nhánh">
            <option value="">Tất cả chi nhánh thật</option>
            {branches.map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn} – {b.ten}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup title="Mức tồn">
          <Facet<LevelFilter> name="level" value={level} onChange={setLevel} options={[
            { id: "all", label: "Tất cả", count: rows.length },
            { id: "critical", label: "Dưới ngưỡng", count: count("critical") },
            { id: "warning", label: "Sắp chạm ngưỡng", count: count("warning") },
            { id: "unset", label: "Chưa đặt ngưỡng", count: count("unset") },
          ]} />
        </FilterGroup>
      </aside>
      <section className="card">
        {shown.length === 0 ? <Empty>Không có dòng nào khớp bộ lọc.</Empty> : (
          <div className="table-wrap scroll" style={{ maxHeight: 640 }}>
            <table>
              <thead>
                <tr><th>Chi nhánh</th><th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th className="num">Ngưỡng</th><th>Mức tồn</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const l = stockLevel(r.soLuong, r.nguongToiThieu);
                  return (
                    <tr key={r.maCn + r.maSp} className={l === "critical" ? "low" : ""}>
                      <td className="nowrap">{r.maCn} <span className="muted">{r.tenCn}</span></td>
                      <td className="code">{r.maSp}</td>
                      <td>{r.tenSp}</td>
                      <td className="num"><b>{fmtNumber(r.soLuong)}</b></td>
                      <td className="num">{r.nguongToiThieu ? fmtNumber(r.nguongToiThieu) : "—"}</td>
                      <td><StockBar soLuong={r.soLuong} nguong={r.nguongToiThieu} /></td>
                      <td>{l !== "ok" && <Badge tone={LEVEL_TONE[l]}>{LEVEL_LABEL[l]}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-foot">Hiển thị {shown.length} / {rows.length} dòng</div>
      </section>
    </div>
  );
}

const LEVEL_TONE: Record<StockLevel, string> = { critical: "danger", warning: "warn", ok: "success", unset: "muted" };

/** FR-23: log yêu cầu và cấp phát, lọc theo CN, SP, trạng thái, khoảng thời gian. */
export function RequestHistory({ branches, products, version }: {
  branches: Branch[]; products: Product[]; version: number;
}) {
  const [f, setF] = useState({ maCn: "", maSp: "", trangThai: "", tu: "", den: "" });
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(f).toString();
    api<RequestRow[]>(`/api/requests?${q}`).then((r) => { setRows(r); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [f, version]);

  return (
    <div className="listpage">
      <aside className="filters">
        <FilterGroup title="Chi nhánh">
          <select value={f.maCn} onChange={(e) => setF({ ...f, maCn: e.target.value })} aria-label="Chi nhánh">
            <option value="">Tất cả</option>
            {branches.map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn} – {b.ten}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup title="Mặt hàng">
          <select value={f.maSp} onChange={(e) => setF({ ...f, maSp: e.target.value })} aria-label="Mặt hàng">
            <option value="">Tất cả</option>
            {products.map((p) => <option key={p.maSp} value={p.maSp}>{p.maSp} – {p.ten}</option>)}
          </select>
        </FilterGroup>
        <FilterGroup title="Trạng thái">
          <Facet name="trangThai" value={f.trangThai} onChange={(v) => setF({ ...f, trangThai: v })} options={[
            { id: "", label: "Tất cả" },
            ...["CHO", "DA_DE_XUAT", "THIEU_HANG", "DA_GIAO", "HOAN_TAT", "TU_CHOI"].map((s) => ({ id: s, label: STATE_LABEL[s] })),
          ]} />
        </FilterGroup>
        <FilterGroup title="Thời gian tạo">
          <div className="form-stack">
            <label className="field">Từ ngày<input type="date" value={f.tu} onChange={(e) => setF({ ...f, tu: e.target.value })} /></label>
            <label className="field">Đến ngày<input type="date" value={f.den} onChange={(e) => setF({ ...f, den: e.target.value })} /></label>
          </div>
        </FilterGroup>
      </aside>
      <section className="card">
        {error && <div className="card-body"><p className="banner banner-danger" style={{ margin: 0 }}>{error}</p></div>}
        {rows.length === 0 ? <Empty>Không có yêu cầu nào khớp bộ lọc.</Empty> : (
          <div className="table-wrap scroll" style={{ maxHeight: 640 }}>
            <table>
              <thead>
                <tr>
                  <th>Mã YC</th><th>Tạo lúc</th><th>Chi nhánh</th><th>Mặt hàng</th><th className="num">Đề xuất</th><th className="num">Chốt</th>
                  <th className="num">Giao</th><th>Trạng thái</th><th>Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.maYc}>
                    <td className="code">YC{r.maYc}</td>
                    <td className="muted nowrap">{r.taoLuc.slice(0, 19)}</td>
                    <td className="nowrap">{r.maCn} <span className="muted">{r.tenCn}</span></td>
                    <td>{r.maSp} <span className="muted">{r.tenSp}</span></td>
                    <td className="num">{fmtNumber(r.soLuongDeXuat)}</td>
                    <td className="num">{fmtNumber(r.soLuongChot)}</td>
                    <td className="num">{fmtNumber(r.soLuongGiao)}</td>
                    <td><StateBadge state={r.trangThai} /></td>
                    <td className="muted nowrap">{r.capNhatLuc.slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-foot">{rows.length} yêu cầu</div>
      </section>
    </div>
  );
}

/** 7.2-B: điều chuyển hàng giữa chi nhánh. */
export function Transfers({ version }: { version: number }) {
  const [rows, setRows] = useState<TransferRow[]>([]);
  useEffect(() => {
    api<TransferRow[]>("/api/transfers").then(setRows).catch(() => {});
  }, [version]);

  return (
    <Card title="Phiếu điều chuyển giữa chi nhánh">
      <p className="note">
        Khi kho tổng không đủ (OUT_OF_STOCK), server tự tìm chi nhánh có tồn &gt; 2 × ngưỡng và gửi TRANSFER_REQ.
        Chi nhánh nguồn đồng ý thì hàng được chuyển trong một transaction; từ chối thì server thử chi nhánh kế tiếp.
      </p>
      {rows.length === 0 ? <Empty>Chưa có lần điều chuyển nào.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Mã phiếu</th><th>Yêu cầu</th><th>Chi nhánh chuyển</th><th>Chi nhánh nhận</th><th>Mặt hàng</th><th className="num">SL</th><th>Trạng thái</th><th>Cập nhật</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.maDc}>
                  <td className="code">DC{r.maDc}</td>
                  <td>YC{r.maYc}</td>
                  <td>{r.tuCn} <span className="muted">{r.tenTuCn}</span></td>
                  <td>{r.denCn} <span className="muted">{r.tenDenCn}</span></td>
                  <td>{r.maSp} <span className="muted">{r.tenSp}</span></td>
                  <td className="num">{fmtNumber(r.soLuong)}</td>
                  <td><StateBadge state={r.trangThai} transfer /></td>
                  <td className="muted nowrap">{r.capNhatLuc.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type ReconcileRow = {
  maSp: string; ten: string; tongNhap: number; tongXuat: number; tonTong: number; cnDaNhan: number;
  tuDieuChuyen: number; dangGiao: number; khop: boolean;
};

/** NFR-03: đối soát kho. */
export function Reconcile({ version }: { version: number }) {
  const [data, setData] = useState<{ khop: boolean; sanPham: ReconcileRow[]; ghiChu: string } | null>(null);
  useEffect(() => {
    api<typeof data>("/api/reconcile").then(setData).catch(() => {});
  }, [version]);
  if (!data) return null;
  return (
    <Card title="Đối soát kho tổng và chi nhánh (NFR-03)" actions={
      <Badge tone={data.khop ? "success" : "danger"}>{data.khop ? "Toàn bộ khớp" : "Có mặt hàng lệch"}</Badge>
    }>
      <p className="note">
        Tổng xuất kho tổng (phiếu xuất) phải bằng số chi nhánh đã nhận từ kho tổng cộng số đang giao; kho tổng không bao giờ âm.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mặt hàng</th><th className="num">Tổng nhập</th><th className="num">Tồn kho tổng</th>
              <th className="num">Tổng xuất</th><th className="num">CN đã nhận</th><th className="num">trong đó điều chuyển</th>
              <th className="num">Đang giao</th><th />
            </tr>
          </thead>
          <tbody>
            {data.sanPham.map((r) => (
              <tr key={r.maSp} className={r.khop ? "" : "low"}>
                <td>{r.maSp} <span className="muted">{r.ten}</span></td>
                <td className="num">{fmtNumber(r.tongNhap)}</td>
                <td className="num">{fmtNumber(r.tonTong)}</td>
                <td className="num">{fmtNumber(r.tongXuat)}</td>
                <td className="num">{fmtNumber(r.cnDaNhan)}</td>
                <td className="num">{fmtNumber(r.tuDieuChuyen)}</td>
                <td className="num">{fmtNumber(r.dangGiao)}</td>
                <td><Badge tone={r.khop ? "success" : "danger"}>{r.khop ? "Khớp" : "Lệch"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
