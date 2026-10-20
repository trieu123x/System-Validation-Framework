"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { Product } from "@/lib/types";
import { Card, Empty, useAction } from "@/components/ui";

type Import = { maPn: number; maSp: string; ten: string; soLuong: number; nhaCungCap: string | null; thoiGian: string };

const EMPTY = { maSp: "", ten: "", donVi: "", gia: "" };

export function Products({ products, version, push }: {
  products: Product[]; version: number; push: (l: string, t: string) => void;
}) {
  const { run, busy } = useAction(push);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [imp, setImp] = useState({ maSp: "", soLuong: "", nhaCungCap: "" });
  const [imports, setImports] = useState<Import[]>([]);

  useEffect(() => {
    api<Import[]>("/api/imports").then(setImports).catch(() => {});
  }, [version]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = editing
      ? await run(() => api(`/api/products/${encodeURIComponent(editing)}`, form, "PUT"), `Đã sửa ${editing}`)
      : await run(() => api("/api/products", form), `Đã thêm ${form.maSp}`);
    if (ok) {
      setForm(EMPTY);
      setEditing(null);
    }
  };

  const remove = (p: Product) => {
    if (confirm(`Xoá sản phẩm ${p.maSp} – ${p.ten}?`)) {
      run(() => api(`/api/products/${encodeURIComponent(p.maSp)}`, undefined, "DELETE"), `Đã xoá ${p.maSp}`);
    }
  };

  const doImport = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api("/api/imports", { ...imp, soLuong: Number(imp.soLuong) }),
      `Đã nhập ${imp.soLuong} ${imp.maSp} vào kho tổng`);
    if (ok) setImp({ maSp: imp.maSp, soLuong: "", nhaCungCap: imp.nhaCungCap });
  };

  return (
    <div className="split">
      <div className="col">
        <Card title={<>Danh sách hàng hóa <span className="muted">· {products.length} mặt hàng</span></>}>
          {products.length === 0 ? <Empty>Chưa có mặt hàng nào.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Mã hàng</th><th>Tên hàng</th><th>Đơn vị</th><th className="num">Giá bán</th><th className="num">Tồn kho tổng</th><th /></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.maSp} className={editing === p.maSp ? "warn" : ""}>
                      <td className="code">{p.maSp}</td>
                      <td>{p.ten}</td>
                      <td>{p.donVi}</td>
                      <td className="num">{fmtNumber(p.gia)}</td>
                      <td className="num"><b>{fmtNumber(p.tonTong)}</b></td>
                      <td className="right nowrap">
                        <button className="btn btn-sm" onClick={() => {
                          setEditing(p.maSp);
                          setForm({ maSp: p.maSp, ten: p.ten, donVi: p.donVi, gia: String(p.gia) });
                        }}>Sửa</button>{" "}
                        <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>Xoá</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Phiếu nhập kho gần đây">
          {imports.length === 0 ? <Empty>Chưa có phiếu nhập.</Empty> : (
            <div className="table-wrap scroll" style={{ maxHeight: 300 }}>
              <table>
                <thead><tr><th>Mã phiếu</th><th>Thời gian</th><th>Mặt hàng</th><th>Nhà cung cấp</th><th className="num">Số lượng</th></tr></thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.maPn}>
                      <td className="code">PN{i.maPn}</td>
                      <td className="muted nowrap">{i.thoiGian.slice(0, 19)}</td>
                      <td>{i.maSp} <span className="muted">{i.ten}</span></td>
                      <td>{i.nhaCungCap ?? ""}</td>
                      <td className="num">{fmtNumber(i.soLuong)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="col">
        <Card title={editing ? `Sửa hàng hóa ${editing}` : "Thêm hàng hóa"}>
          <form className="form-stack" onSubmit={save}>
            <label className="field">Mã hàng
              <input value={form.maSp} disabled={!!editing} required maxLength={10}
                onChange={(e) => setForm({ ...form, maSp: e.target.value })} />
            </label>
            <label className="field">Tên hàng
              <input value={form.ten} required onChange={(e) => setForm({ ...form, ten: e.target.value })} />
            </label>
            <label className="field">Đơn vị tính
              <input value={form.donVi} required onChange={(e) => setForm({ ...form, donVi: e.target.value })} />
            </label>
            <label className="field">Giá bán (đ)
              <input type="number" min={0} value={form.gia} style={{ textAlign: "left" }}
                onChange={(e) => setForm({ ...form, gia: e.target.value })} />
            </label>
            <div className="form-actions">
              <button className="btn btn-success" disabled={busy}>{editing ? "Lưu" : "Thêm mới"}</button>
              {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(EMPTY); }}>Bỏ qua</button>}
            </div>
          </form>
        </Card>

        <Card title="Nhập hàng vào kho tổng">
          <form className="form-stack" onSubmit={doImport}>
            <label className="field">Mặt hàng
              <select value={imp.maSp} required onChange={(e) => setImp({ ...imp, maSp: e.target.value })}>
                <option value="">— chọn —</option>
                {products.map((p) => <option key={p.maSp} value={p.maSp}>{p.maSp} – {p.ten}</option>)}
              </select>
            </label>
            <label className="field">Số lượng
              <input type="number" min={1} required value={imp.soLuong} style={{ textAlign: "left" }}
                onChange={(e) => setImp({ ...imp, soLuong: e.target.value })} />
            </label>
            <label className="field">Nhà cung cấp
              <input value={imp.nhaCungCap} onChange={(e) => setImp({ ...imp, nhaCungCap: e.target.value })} />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>Nhập kho</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
