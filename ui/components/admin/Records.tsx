"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber, STATE_LABEL } from "@/lib/api";
import type { Branch, Product, RequestRow, TransferRow } from "@/lib/types";
import {
  Badge, Card, Empty, Facet, FilterGroup, StateBadge,
} from "@/components/ui";

/** FR-23: log yêu cầu và cấp phát, lọc theo CN, SP, trạng thái, khoảng thời gian. */
export function RequestHistory({ branches, products, version }: {
  branches: Branch[]; products: Product[]; version: number;
}) {
  const [f, setF] = useState({ maCn: "", maSp: "", trangThai: "", tu: "", den: "", chenhLech: "" });
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
        <FilterGroup title="Kiểm đếm">
          <label className="row"><input type="checkbox" checked={f.chenhLech === "true"}
            onChange={(e) => setF({ ...f, chenhLech: e.target.checked ? "true" : "" })} /> Chỉ đơn thừa / thiếu</label>
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
                  <th className="num">Giao</th><th className="num">Thực nhận</th><th>Chênh lệch</th><th>Trạng thái</th><th>Cập nhật</th>
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
                    <td className="num">{fmtNumber(r.soLuongNhan)}</td>
                    <td>{r.soLuongNhan == null ? <span className="muted">Chưa ghi nhận</span> :
                      <Badge tone={r.chenhLech === 0 ? "success" : "danger"}>{r.chenhLech === 0 ? "Đủ hàng" : `${(r.chenhLech ?? 0) > 0 ? "Thừa" : "Thiếu"} ${Math.abs(r.chenhLech ?? 0)}`}</Badge>}</td>
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
  tuDieuChuyen: number; dangGiao: number; soDonLech: number; khop: boolean;
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
        Số nhận dựa trên kiểm đếm thực tế; đơn cũ chưa kiểm đếm dùng số đã giao. Đơn thừa/thiếu luôn được đánh dấu lệch để đối chiếu, kể cả khi chênh lệch giữa các đơn bù nhau.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mặt hàng</th><th className="num">Tổng nhập</th><th className="num">Tồn kho tổng</th>
              <th className="num">Tổng xuất</th><th className="num">CN đã nhận</th><th className="num">trong đó điều chuyển</th>
              <th className="num">Đang giao</th><th className="num">Đơn thừa/thiếu</th><th />
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
                <td className="num">{fmtNumber(r.soDonLech)}</td>
                <td><Badge tone={r.khop ? "success" : "danger"}>{r.khop ? "Khớp" : "Lệch"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
