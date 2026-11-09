"use client";

import { useState } from "react";
import type { Category, Product } from "@/lib/types";
import { fmtMoney, fmtNumber } from "@/lib/api";
import { Empty, Facet, FilterGroup, ProductImage } from "@/components/ui";
import { useCatalogSearch } from "@/components/WorkspaceShell";
import { CatalogBrand, CatalogDiscovery } from "@/components/CatalogDiscovery";

export function ProductCatalog({ products, categories, editing, busy, onEdit, onImport, onRemove, onCreate }: {
  products: Product[]; categories: Category[]; editing: string | null; busy: boolean;
  onEdit: (product: Product) => void; onImport: (product: Product) => void; onRemove: (product: Product) => void; onCreate: () => void;
}) {
  const { query, setQuery } = useCatalogSearch();
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("default");
  const [view, setView] = useState("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = products.filter((product) => (!category || product.maDm === category)
    && (availability === "all" || (availability === "stocked" ? product.tonTong > 0 : product.tonTong === 0))
    && (!needle || [product.maSp, product.ten, product.model].join(" ").toLocaleLowerCase("vi").includes(needle)))
    .sort((a, b) => sort === "name" ? a.ten.localeCompare(b.ten, "vi") : sort === "price" ? a.giaXuat - b.giaXuat : sort === "stock" ? a.tonTong - b.tonTong : 0);
  const categoryList = categories.length ? categories : [...new Map(products.map((p) => [p.maDm, { maDm: p.maDm, ten: p.tenDm, soMatHang: products.filter((v) => v.maDm === p.maDm).length }])).values()];
  const filtered = !!query || !!category || availability !== "all";
  const clearFilters = () => { setQuery(""); setCategory(""); setAvailability("all"); };

  return <>
    <div className="industry-catalog-layout admin-product-catalog">
    <div className="store-catalog-sidebar">
    <CatalogBrand />
    <aside className="industry-catalog-filters" aria-label="Bộ lọc hàng hóa">
      <details open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}><summary>Lọc hàng hóa <span>{products.length}</span></summary>
        <FilterGroup title="Danh mục"><Facet name="admin-category" value={category} onChange={setCategory} options={[{ id: "", label: "Tất cả danh mục", count: products.length }, ...categoryList.map((c) => ({ id: c.maDm, label: c.ten, count: products.filter((p) => p.maDm === c.maDm).length }))]} /></FilterGroup>
        <FilterGroup title="Kho tổng"><Facet name="admin-availability" value={availability} onChange={setAvailability} options={[{ id: "all", label: "Tất cả", count: products.length }, { id: "stocked", label: "Còn hàng", count: products.filter((p) => p.tonTong > 0).length }, { id: "empty", label: "Hết hàng", count: products.filter((p) => p.tonTong === 0).length }]} /></FilterGroup>
      </details>
    </aside>
    </div>
    <section className="industry-catalog-main" aria-label="Danh sách hàng hóa">
      {products.length > 0 && <CatalogDiscovery categories={categoryList.map((c) => ({ id: c.maDm, label: c.ten, count: products.filter((p) => p.maDm === c.maDm).length, image: products.find((p) => p.maDm === c.maDm)?.anhUrl }))}
        selected={category} onSelect={setCategory} />}
      <div className="catalog-toolbar">
        <h2 className="trade-results-heading">Hàng hóa trong kho tổng</h2>
        <select aria-label="Sắp xếp hàng hóa" value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Sắp xếp mặc định</option><option value="name">Tên A → Z</option><option value="price">Giá xuất tăng dần</option><option value="stock">Tồn kho tăng dần</option></select>
        <div className="catalog-view-switch" role="group" aria-label="Cách xem hàng hóa"><button type="button" aria-pressed={view === "grid"} aria-label="Xem thẻ hàng hóa" onClick={() => setView("grid")}>▦</button><button type="button" aria-pressed={view === "table"} aria-label="Xem bảng hàng hóa" onClick={() => setView("table")}>☷</button></div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>+ Thêm hàng hóa</button>
      </div>
      <div className="catalog-results"><span><b>{shown.length}</b> mặt hàng{category ? ` · ${categoryList.find((c) => c.maDm === category)?.ten ?? ""}` : " trong kho tổng"}{query && ` · Tìm: ${query}`}</span>{filtered && <button type="button" className="btn-link" onClick={clearFilters}>Xóa bộ lọc</button>}</div>
      {!shown.length ? <Empty>{products.length ? "Không có mặt hàng nào khớp bộ lọc." : "Chưa có mặt hàng nào."}</Empty> : view === "grid" ? <div className="industry-product-grid">{shown.map((p) => <article className="industry-product-card" key={p.maSp} aria-label={`${p.maSp} ${p.ten}`}>
        <div className="industry-product-image"><ProductImage src={p.anhUrl} alt={p.ten} category={p.tenDm} size={260} fit="contain" /><span className={`catalog-stock-label${p.tonTong === 0 ? " is-empty" : ""}`}>{p.tonTong === 0 ? "Hết hàng" : `Kho tổng: ${fmtNumber(p.tonTong)}`}</span><button type="button" className="catalog-image-action" aria-label={`Sửa ${p.maSp}`} disabled={busy} onClick={() => onEdit(p)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></svg></button></div>
        <div className="industry-product-info"><span className="catalog-category">{p.tenDm}</span><div className="catalog-product-heading"><h3>{p.ten}</h3><strong>{fmtMoney(p.giaXuat)}</strong></div><span className="catalog-product-meta">{p.maSp}{p.model ? ` · ${p.model}` : ""} · Giá xuất / {p.donVi}</span><dl className="catalog-admin-prices"><div><dt>Giá nhập</dt><dd>{fmtMoney(p.giaNhap)}</dd></div><div><dt>Bán lẻ</dt><dd>{fmtMoney(p.giaBanLe)}</dd></div></dl><div className="catalog-product-actions"><button type="button" className="btn" disabled={busy} onClick={() => onImport(p)}>Nhập kho <span aria-hidden="true">↗</span></button><button type="button" className="btn-link" disabled={busy} onClick={() => onEdit(p)}>Sửa</button><button type="button" className="btn-link catalog-delete" disabled={busy} onClick={() => onRemove(p)}>Xoá</button></div></div>
      </article>)}</div> : <div className="card"><div className="table-wrap"><table className="products-table"><thead><tr><th scope="col">Mặt hàng</th><th scope="col">Danh mục</th><th scope="col" className="num">Giá nhập</th><th scope="col" className="num">Giá xuất CN</th><th scope="col" className="num">Giá bán lẻ</th><th scope="col" className="num">Kho tổng</th><th scope="col">Thao tác</th></tr></thead><tbody>{shown.map((p) => <tr key={p.maSp} className={editing === p.maSp ? "warn" : ""}><td><div className="with-thumb"><ProductImage src={p.anhUrl} alt={p.ten} category={p.tenDm} /><div>{p.ten}<small className="catalog-product-meta">{p.maSp} · {p.model} · {p.donVi}</small></div></div></td><td>{p.tenDm}</td><td className="num nowrap">{fmtMoney(p.giaNhap)}</td><td className="num nowrap">{fmtMoney(p.giaXuat)}</td><td className="num nowrap">{fmtMoney(p.giaBanLe)}</td><td className="num">{fmtNumber(p.tonTong)}</td><td><div className="row"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => onEdit(p)}>Sửa</button><button type="button" className="btn btn-sm" disabled={busy} onClick={() => onImport(p)}>Nhập kho</button><button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => onRemove(p)}>Xoá</button></div></td></tr>)}</tbody></table></div></div>}
    </section>
  </div></>;
}
