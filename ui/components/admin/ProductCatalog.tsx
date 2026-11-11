"use client";

import { useId, useRef, useState } from "react";
import type { Category, Product } from "@/lib/types";
import { fmtMoney, fmtNumber } from "@/lib/api";
import { Empty, ProductImage } from "@/components/ui";
import { useCatalogSearch } from "@/components/WorkspaceShell";
import { CatalogDiscovery } from "@/components/CatalogDiscovery";
// Dùng chung bố cục với trang bán hàng của chi nhánh: danh mục bên trái, "Bộ lọc" phía trên danh sách
import "@/components/branch/sales.css";

type Availability = "all" | "stocked" | "empty";

/** Hàng hóa kho tổng; bố cục và bộ lọc đồng nhất với trang Bán hàng của chi nhánh (components/branch/Sales.tsx). */
export function ProductCatalog({ products, categories, editing, busy, onEdit, onImport, onRemove, onCreate }: {
  products: Product[]; categories: Category[]; editing: string | null; busy: boolean;
  onEdit: (product: Product) => void; onImport: (product: Product) => void; onRemove: (product: Product) => void; onCreate: () => void;
}) {
  const { query, setQuery } = useCatalogSearch();
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState<Availability>("all");
  const [sort, setSort] = useState("default");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const categoryPanelId = useId();
  const filterOptionsId = useId();
  const categoryTrigger = useRef<HTMLButtonElement>(null);
  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = products.filter((product) => (!category || product.maDm === category)
    && (availability === "all" || (availability === "stocked" ? product.tonTong > 0 : product.tonTong === 0))
    && (!needle || [product.maSp, product.ten, product.model].join(" ").toLocaleLowerCase("vi").includes(needle)))
    .sort((a, b) => sort === "name" ? a.ten.localeCompare(b.ten, "vi") : sort === "price" ? a.giaXuat - b.giaXuat : sort === "stock" ? a.tonTong - b.tonTong : 0);
  const categoryList = categories.length ? categories : [...new Map(products.map((p) => [p.maDm, { maDm: p.maDm, ten: p.tenDm, soMatHang: products.filter((v) => v.maDm === p.maDm).length }])).values()];
  const categoryName = category ? categoryList.find((c) => c.maDm === category)?.ten ?? category : "Tất cả hàng hóa";
  const stocked = products.filter((p) => p.tonTong > 0).length;
  const filtered = !!query || !!category || availability !== "all";
  const clearFilters = () => { setQuery(""); setCategory(""); setAvailability("all"); };

  return <>
    <div className="sales-layout industry-catalog-layout branch-catalog-layout admin-product-catalog">
    <aside className={`sales-category-sidebar${categoriesOpen ? " is-open" : ""}`} aria-label="Danh mục hàng hóa">
      <button ref={categoryTrigger} type="button" className="sales-category-toggle" aria-expanded={categoriesOpen} aria-controls={categoryPanelId} onClick={() => setCategoriesOpen((open) => !open)}>
        <span><strong>Danh mục sản phẩm</strong><small>{categoryName}</small></span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className="sales-category-panel" id={categoryPanelId}>
        <CatalogDiscovery variant="sidebar" allCategory={{ id: "", label: "Tất cả hàng hóa", count: products.length }}
          categories={categoryList.map((c) => ({ id: c.maDm, label: c.ten, count: products.filter((p) => p.maDm === c.maDm).length, image: products.find((p) => p.maDm === c.maDm)?.anhUrl }))}
          selected={category} onSelect={(next) => {
            setCategory(next);
            setCategoriesOpen(false);
            if (window.matchMedia("(max-width: 899px)").matches) categoryTrigger.current?.focus({ preventScroll: true });
          }} />
      </div>
    </aside>
    <section className="sales-catalog" aria-label="Danh sách hàng hóa">
      <section className={`sales-filter-panel${filtersOpen ? " is-expanded" : ""}`} aria-label="Bộ lọc hàng hóa">
        <div className="sales-filter-heading"><h2><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>Bộ lọc hàng hóa</h2><button type="button" className="btn-link" disabled={!filtered} onClick={clearFilters}>Xóa bộ lọc</button></div>
        <div className="sales-filter-fields">
          <label className="field sales-local-search">Tìm trong hàng hóa<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên hàng hóa, mã hàng hoặc model" /></label>
          <button type="button" className="sales-filter-toggle" aria-expanded={filtersOpen} aria-controls={filterOptionsId} onClick={() => setFiltersOpen((open) => !open)}><span>Kho tổng</span><small>{availability !== "all" ? "1 điều kiện" : "Tất cả"}</small><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
          <div className="sales-filter-options" id={filterOptionsId}>
          <label className="field">Kho tổng<select value={availability} onChange={(event) => setAvailability(event.target.value as Availability)}>
            <option value="all">Tất cả ({products.length})</option><option value="stocked">Còn hàng ({stocked})</option><option value="empty">Hết hàng ({products.length - stocked})</option>
          </select></label>
          </div>
        </div>
      </section>
      <div className="sales-toolbar card">
        <div className="card-head"><div className="sales-catalog-title"><h2>Hàng hóa trong kho tổng</h2><span>{shown.length} / {products.length} mặt hàng</span></div>
        </div>
        <div className="sales-searchbar">
          <select aria-label="Sắp xếp hàng hóa" value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Sắp xếp mặc định</option><option value="name">Tên A → Z</option><option value="price">Giá xuất tăng dần</option><option value="stock">Tồn kho tăng dần</option></select>
          <div className="sales-view-switch" role="group" aria-label="Cách xem hàng hóa"><button type="button" aria-pressed={view === "grid"} aria-label="Xem dạng thẻ" title="Xem dạng thẻ" onClick={() => setView("grid")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z" /></svg></button><button type="button" aria-pressed={view === "table"} aria-label="Xem dạng bảng" title="Xem dạng bảng" onClick={() => setView("table")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16" /></svg></button></div>
          <button type="button" className="btn btn-primary admin-catalog-create" onClick={onCreate}>+ Thêm hàng hóa</button>
        </div>
      </div>
      <div className="sales-results"><span><i className="sales-result-dot" />{categoryName}{query && ` · Tìm: ${query}`}</span><span>{products.length - stocked} mặt hàng hết hàng ở kho tổng</span></div>
      {!shown.length ? <Empty>{products.length ? "Không có mặt hàng nào khớp bộ lọc." : "Chưa có mặt hàng nào."}</Empty> : view === "grid" ? <div className="industry-product-grid">{shown.map((p) => <article className="industry-product-card" key={p.maSp} aria-label={`${p.maSp} ${p.ten}`}>
        <div className="industry-product-image"><ProductImage src={p.anhUrl} alt={p.ten} category={p.tenDm} size={260} fit="contain" /><span className={`catalog-stock-label${p.tonTong === 0 ? " is-empty" : ""}`}>{p.tonTong === 0 ? "Hết hàng" : `Kho tổng: ${fmtNumber(p.tonTong)}`}</span><button type="button" className="catalog-image-action" aria-label={`Sửa ${p.maSp}`} disabled={busy} onClick={() => onEdit(p)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></svg></button></div>
        <div className="industry-product-info"><span className="catalog-category">{p.tenDm}</span><div className="catalog-product-heading"><h3 title={p.ten}>{p.ten}</h3><strong>{fmtMoney(p.giaXuat)}</strong></div><span className="catalog-product-meta">{p.maSp}{p.model ? ` · ${p.model}` : ""} · Giá xuất / {p.donVi}</span><dl className="catalog-admin-prices"><div><dt>Giá nhập</dt><dd>{fmtMoney(p.giaNhap)}</dd></div><div><dt>Bán lẻ</dt><dd>{fmtMoney(p.giaBanLe)}</dd></div></dl><div className="catalog-product-actions"><button type="button" className="btn" disabled={busy} onClick={() => onImport(p)}>Nhập kho <span aria-hidden="true">↗</span></button><button type="button" className="btn-link" disabled={busy} onClick={() => onEdit(p)}>Sửa</button><button type="button" className="btn-link catalog-delete" disabled={busy} onClick={() => onRemove(p)}>Xoá</button></div></div>
      </article>)}</div> : <div className="card"><div className="table-wrap" tabIndex={0}><table className="products-table"><thead><tr><th scope="col">Mặt hàng</th><th scope="col">Danh mục</th><th scope="col" className="num">Giá nhập</th><th scope="col" className="num">Giá xuất CN</th><th scope="col" className="num">Giá bán lẻ</th><th scope="col" className="num">Kho tổng</th><th scope="col">Thao tác</th></tr></thead><tbody>{shown.map((p) => <tr key={p.maSp} className={editing === p.maSp ? "warn" : ""}><td><div className="with-thumb"><ProductImage src={p.anhUrl} alt={p.ten} category={p.tenDm} /><div>{p.ten}<small className="catalog-product-meta">{p.maSp} · {p.model} · {p.donVi}</small></div></div></td><td>{p.tenDm}</td><td className="num nowrap">{fmtMoney(p.giaNhap)}</td><td className="num nowrap">{fmtMoney(p.giaXuat)}</td><td className="num nowrap">{fmtMoney(p.giaBanLe)}</td><td className="num">{fmtNumber(p.tonTong)}</td><td><div className="row"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => onEdit(p)}>Sửa</button><button type="button" className="btn btn-sm" disabled={busy} onClick={() => onImport(p)}>Nhập kho</button><button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => onRemove(p)}>Xoá</button></div></td></tr>)}</tbody></table></div></div>}
    </section>
  </div></>;
}
