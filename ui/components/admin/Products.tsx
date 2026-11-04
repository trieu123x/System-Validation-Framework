"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, fmtMoney, fmtNumber } from "@/lib/api";
import type { Category, Product, Supplier } from "@/lib/types";
import { Card, Empty, ProductImage, useAction, type BackAction } from "@/components/ui";

type Import = {
  maPn: number; maSp: string; ten: string; soLuong: number; maNcc: string; tenNcc: string;
  donGia: number; thanhTien: number; thoiGian: string;
};

const EMPTY = { maSp: "", ten: "", donVi: "cái", model: "", maDm: "", giaNhap: "", giaXuat: "", giaBanLe: "" };

export function Products({ products, version, push, onBackChange }: {
  products: Product[]; version: number; push: (l: string, t: string) => void; onBackChange: (back: BackAction | null) => void;
}) {
  const { run, busy } = useAction(push);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [imp, setImp] = useState({ maSp: "", soLuong: "", maNcc: "", donGia: "" });
  const [imports, setImports] = useState<Import[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dm, setDm] = useState("");
  const [query, setQuery] = useState("");
  const [readError, setReadError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    onBackChange(editing ? { label: "Hủy chỉnh sửa", onClick: () => { setEditing(null); setForm(EMPTY); } } : null);
    return () => onBackChange(null);
  }, [editing, onBackChange]);

  useEffect(() => {
    let active = true;
    setReadError("");
    const failed = (error: Error) => { if (active) setReadError(error.message); };
    api<Import[]>("/api/imports").then((data) => { if (active) setImports(data); }).catch(failed);
    api<Category[]>("/api/categories").then((data) => { if (active) setCategories(data); }).catch(failed);
    api<Supplier[]>("/api/suppliers").then((data) => { if (active) setSuppliers(data); }).catch(failed);
    return () => { active = false; };
  }, [version, reload]);

  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = products.filter((product) => (!dm || product.maDm === dm)
    && (!needle || [product.maSp, product.ten, product.model].join(" ").toLocaleLowerCase("vi").includes(needle)));
  // giá xuất cho chi nhánh thấp hơn giá nhập là bán lỗ: chỉ cảnh báo, vẫn cho lưu
  const belowCost = form.giaNhap !== "" && form.giaXuat !== "" && Number(form.giaXuat) < Number(form.giaNhap);
  const impProduct = products.find((p) => p.maSp === imp.maSp);

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
    if (ok) setImp({ maSp: imp.maSp, soLuong: "", maNcc: imp.maNcc, donGia: "" });
  };

  return (
    <div className="split">
      <div className="col">
        {readError && <div className="banner banner-danger" role="alert">Không tải được dữ liệu nhập kho: {readError}<button type="button" className="btn btn-sm" onClick={() => setReload((value) => value + 1)} style={{ marginLeft: 10 }}>Thử lại</button></div>}
        <Card title={<>Danh sách hàng hóa <span className="muted">· {shown.length} mặt hàng</span></>}
          actions={(
            <>
            <input type="search" placeholder="Tìm mã, tên hoặc model..." aria-label="Tìm hàng hóa" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select value={dm} onChange={(e) => setDm(e.target.value)} aria-label="Lọc theo danh mục">
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => <option key={c.maDm} value={c.maDm}>{c.ten} ({c.soMatHang})</option>)}
            </select>
            </>
          )}>
          {shown.length === 0 ? <Empty>{products.length ? "Không có mặt hàng nào khớp bộ lọc." : "Chưa có mặt hàng nào."}</Empty> : (
            <div className="table-wrap">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Mã hàng</th><th>Tên hàng</th><th>Danh mục</th><th>ĐV</th>
                    <th className="num">Giá nhập</th><th className="num">Giá xuất CN</th><th className="num">Giá bán lẻ</th>
                    <th className="num">Tồn kho tổng</th><th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.maSp} className={editing === p.maSp ? "warn" : ""}>
                      <td className="code">{p.maSp}</td>
                      <td>
                        <div className="with-thumb">
                          <ProductImage src={p.anhUrl} alt={p.ten} category={p.tenDm} />
                          <div>
                            {p.ten}
                            {p.model && <div className="muted" style={{ fontSize: 12 }}>Model {p.model}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">{p.tenDm}</td>
                      <td>{p.donVi}</td>
                      <td className="num nowrap">{fmtNumber(p.giaNhap)}</td>
                      <td className="num nowrap">{fmtNumber(p.giaXuat)}</td>
                      <td className="num nowrap">{fmtNumber(p.giaBanLe)}</td>
                      <td className="num"><b>{fmtNumber(p.tonTong)}</b></td>
                      <td className="right nowrap">
                        <button className="btn btn-sm" onClick={() => {
                          setEditing(p.maSp);
                          setForm({
                            maSp: p.maSp, ten: p.ten, donVi: p.donVi, model: p.model ?? "", maDm: p.maDm,
                            giaNhap: String(p.giaNhap), giaXuat: String(p.giaXuat), giaBanLe: String(p.giaBanLe),
                          });
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
                <thead>
                  <tr>
                    <th>Mã phiếu</th><th>Thời gian</th><th>Mặt hàng</th><th>Nhà cung cấp</th>
                    <th className="num">Số lượng</th><th className="num">Đơn giá</th><th className="num">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.maPn}>
                      <td className="code">PN{i.maPn}</td>
                      <td className="muted nowrap">{i.thoiGian.slice(0, 19)}</td>
                      <td>{i.maSp} <span className="muted">{i.ten}</span></td>
                      <td>{i.tenNcc}</td>
                      <td className="num">{fmtNumber(i.soLuong)}</td>
                      <td className="num nowrap">{fmtNumber(i.donGia)}</td>
                      <td className="num nowrap">{fmtMoney(i.thanhTien)}</td>
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
            <div className="form-section-label">Thông tin sản phẩm</div>
            <label className="field">Mã hàng
              <input value={form.maSp} disabled={!!editing} required maxLength={10}
                onChange={(e) => setForm({ ...form, maSp: e.target.value })} />
            </label>
            <label className="field">Tên hàng
              <input value={form.ten} required maxLength={150} onChange={(e) => setForm({ ...form, ten: e.target.value })} />
            </label>
            <label className="field">Danh mục
              <select value={form.maDm} required onChange={(e) => setForm({ ...form, maDm: e.target.value })}>
                <option value="">— chọn —</option>
                {categories.map((c) => <option key={c.maDm} value={c.maDm}>{c.ten}</option>)}
              </select>
            </label>
            <label className="field">Model
              <input value={form.model} maxLength={30} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
            <label className="field">Đơn vị tính
              <input value={form.donVi} required maxLength={20} onChange={(e) => setForm({ ...form, donVi: e.target.value })} />
            </label>
            <div className="form-section-label">Thông tin giá</div>
            <label className="field">Giá nhập (đ)
              <input type="number" min={0} step={1000} value={form.giaNhap} style={{ textAlign: "left" }}
                onChange={(e) => setForm({ ...form, giaNhap: e.target.value })} />
            </label>
            <label className="field">Giá xuất cho chi nhánh (đ)
              <input type="number" min={0} step={1000} value={form.giaXuat} style={{ textAlign: "left" }}
                onChange={(e) => setForm({ ...form, giaXuat: e.target.value })} />
            </label>
            <label className="field">Giá bán lẻ (đ)
              <input type="number" min={0} step={1000} value={form.giaBanLe} style={{ textAlign: "left" }}
                onChange={(e) => setForm({ ...form, giaBanLe: e.target.value })} />
            </label>
            {belowCost && (
              <p className="note" style={{ color: "var(--warn)", margin: 0 }}>
                Giá xuất thấp hơn giá nhập: công ty lỗ {fmtMoney(Number(form.giaNhap) - Number(form.giaXuat))} mỗi {form.donVi || "đơn vị"}.
                Vẫn lưu được.
              </p>
            )}
            <div className="form-actions">
              <button className="btn btn-success" disabled={busy}>{editing ? "Lưu" : "Thêm mới"}</button>
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
            <label className="field">Nhà cung cấp
              <select value={imp.maNcc} required onChange={(e) => setImp({ ...imp, maNcc: e.target.value })}>
                <option value="">— chọn —</option>
                {suppliers.map((s) => <option key={s.maNcc} value={s.maNcc}>{s.maNcc} – {s.ten}</option>)}
              </select>
            </label>
            <label className="field">Số lượng
              <input type="number" min={1} required value={imp.soLuong} style={{ textAlign: "left" }}
                onChange={(e) => setImp({ ...imp, soLuong: e.target.value })} />
            </label>
            <label className="field">Đơn giá (đ)
              <input type="number" min={0} step={1000} value={imp.donGia} style={{ textAlign: "left" }}
                placeholder={impProduct ? `${fmtNumber(impProduct.giaNhap)} (giá nhập hiện tại)` : "mặc định = giá nhập"}
                onChange={(e) => setImp({ ...imp, donGia: e.target.value })} />
            </label>
            {impProduct && Number(imp.soLuong) > 0 && (
              <p className="note" style={{ margin: 0 }}>
                Thành tiền: <b>{fmtMoney(Number(imp.soLuong) * (imp.donGia === "" ? impProduct.giaNhap : Number(imp.donGia)))}</b>
              </p>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy}>Nhập kho</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
