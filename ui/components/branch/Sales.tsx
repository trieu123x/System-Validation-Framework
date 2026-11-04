"use client";

import { useEffect, useState } from "react";
import { fmtMoney, fmtNumber } from "@/lib/api";
import type { CartLine } from "@/lib/checkout";
import type { BranchItem, BranchRequest } from "@/lib/types";
import { Badge, Empty, Facet, FilterGroup, fmtSpec, LEVEL_LABEL, ProductImage, SortTh, sortRows, SpecChips, StockBar, stockLevel, type Sort, type StockLevel } from "@/components/ui";
import { CartIcon } from "./Checkout";
import "./sales.css";

type Filter = "all" | "critical" | "warning" | "unset";
type SupplyFilter = "all" | "waiting" | "none";
type PowerFilter = "all" | "lt500" | "500to1500" | "gt1500" | "none";
type Key = "maHang" | "tenHang" | "giaBanLe" | "soLuong" | "muc" | "congSuatW";

/** Khoảng công suất: < 500 W, 500–1500 W (gồm 2 đầu), > 1500 W, hoặc chưa có thông số. */
const powerBand = (item: BranchItem): Exclude<PowerFilter, "all"> => {
  const w = item.congSuatW;
  if (w == null) return "none";
  return w < 500 ? "lt500" : w <= 1500 ? "500to1500" : "gt1500";
};
type Props = {
  items: BranchItem[]; requests: BranchRequest[]; reported: string[]; online: boolean;
  /** Server có hỗ trợ SPECS (BranchSnapshot.coThongSo). */
  hasSpecs?: boolean;
  cart: CartLine[];
  onAdd: (item: BranchItem, quantity: number) => void; onCart: () => void;
};
const SUPPLY: Record<string, [string, string]> = {
  DA_GIAO: ["info", "hàng đang về"], DA_DE_XUAT: ["warn", "chờ bạn xác nhận"], THIEU_HANG: ["danger", "công ty hết hàng"],
};
const value = (item: BranchItem, key: Key) => key === "muc" ? item.nguong > 0 ? item.soLuong / item.nguong : null : item[key] ?? null;

export function Sales({ items, requests, reported, online, hasSpecs = false, cart, onAdd, onCart }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [category, setCategory] = useState("all");
  const [power, setPower] = useState<PowerFilter>("all");
  const [sort, setSort] = useState<Sort<Key>>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1000px)");
    const update = () => setFiltersOpen(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const count = (level: StockLevel) => items.filter((item) => stockLevel(item.soLuong, item.nguong) === level).length;
  const supply = new Map<string, [string, string]>();
  reported.forEach((code) => supply.set(code, ["warn", "đã báo công ty"]));
  requests.filter((request) => SUPPLY[request.trangThai]).forEach((request) => supply.set(request.maHang, SUPPLY[request.trangThai]));
  const waiting = items.filter((item) => supply.has(item.maHang)).length;
  const categories = [...new Set(items.map((item) => item.danhMuc).filter(Boolean))];
  // server cũ không gửi SPECS: không có chip, không có bộ lọc / cột công suất
  const powerCount = (band: Exclude<PowerFilter, "all">) => items.filter((item) => powerBand(item) === band).length;
  const needle = q.trim().toLowerCase();
  const shown = sortRows(items.filter((item) => (filter === "all" || stockLevel(item.soLuong, item.nguong) === filter)
    && (supplyFilter === "all" || supply.has(item.maHang) === (supplyFilter === "waiting"))
    && (category === "all" || item.danhMuc === category)
    && (!hasSpecs || power === "all" || powerBand(item) === power)
    && (!needle || [item.maHang, item.tenHang, item.model].join(" ").toLowerCase().includes(needle))), sort, value);
  const quantity = cart.reduce((sum, line) => sum + line.soLuong, 0);
  const total = cart.reduce((sum, line) => sum + (items.find((item) => item.maHang === line.maHang)?.giaBanLe ?? 0) * line.soLuong, 0);
  const inCart = (code: string) => cart.find((line) => line.maHang === code)?.soLuong ?? 0;
  const filtered = !!q || filter !== "all" || supplyFilter !== "all" || category !== "all" || power !== "all";
  const th = { sort, onSort: setSort };

  return <div className="sales-layout">
    <aside className="sales-filters filters" aria-label="Bộ lọc sản phẩm">
      <details className="sales-filter-disclosure" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
        <summary>Bộ lọc sản phẩm <span>{items.length}</span></summary>
        {categories.length > 0 && <FilterGroup title="Danh mục"><Facet<string> name="category" value={category} onChange={setCategory} options={[
          { id: "all", label: "Tất cả sản phẩm", count: items.length },
          ...categories.map((name) => ({ id: name, label: name, count: items.filter((item) => item.danhMuc === name).length })),
        ]} /></FilterGroup>}
        {hasSpecs && <FilterGroup title="Công suất"><Facet<PowerFilter> name="power" value={power} onChange={setPower} options={[
          { id: "all", label: "Tất cả", count: items.length },
          { id: "lt500", label: "< 500 W", count: powerCount("lt500") },
          { id: "500to1500", label: "500–1500 W", count: powerCount("500to1500") },
          { id: "gt1500", label: "> 1500 W", count: powerCount("gt1500") },
          { id: "none", label: "Chưa có thông số", count: powerCount("none") },
        ]} /></FilterGroup>}
        <FilterGroup title="Mức tồn"><Facet<Filter> name="level" value={filter} onChange={setFilter} options={[
          { id: "all", label: "Tất cả", count: items.length }, { id: "critical", label: "Dưới ngưỡng", count: count("critical") },
          { id: "warning", label: "Sắp chạm ngưỡng", count: count("warning") }, { id: "unset", label: "Chưa đặt ngưỡng", count: count("unset") },
        ]} /></FilterGroup>
        <FilterGroup title="Nhập hàng"><Facet<SupplyFilter> name="supply" value={supplyFilter} onChange={setSupplyFilter} options={[
          { id: "all", label: "Tất cả", count: items.length }, { id: "waiting", label: "Đang chờ công ty", count: waiting },
          { id: "none", label: "Không chờ", count: items.length - waiting },
        ]} /></FilterGroup>
      </details>
      <div className="sales-order-summary"><span>ĐƠN ĐANG SOẠN</span><strong>{fmtMoney(total)}</strong><small>{cart.length} mặt hàng · {quantity} sản phẩm</small></div>
    </aside>
    <section className="sales-catalog">
      <div className="sales-toolbar card">
        <div className="card-head"><div className="sales-catalog-title"><h2>Sản phẩm tại chi nhánh</h2><span>{shown.length} / {items.length} mặt hàng</span></div>
          <div className="card-actions"><button type="button" className="btn btn-primary cart-shortcut" onClick={onCart}><CartIcon /> Giỏ hàng ({quantity})</button></div>
        </div>
        <div className="sales-searchbar"><label className="sales-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Tìm tên sản phẩm, mã hàng hoặc model..." aria-label="Tìm mặt hàng" value={q} onChange={(event) => setQ(event.target.value)} /></label>
          <select aria-label="Sắp xếp sản phẩm" value={sort ? `${sort.key}:${sort.dir}` : ""} onChange={(event) => {
            if (!event.target.value) setSort(null);
            else { const [key, direction] = event.target.value.split(":"); setSort({ key: key as Key, dir: Number(direction) as 1 | -1 }); }
          }}><option value="">Sắp xếp mặc định</option><option value="tenHang:1">Tên A → Z</option><option value="giaBanLe:1">Giá tăng dần</option><option value="giaBanLe:-1">Giá giảm dần</option><option value="soLuong:1">Tồn kho tăng dần</option><option value="tenHang:-1">Tên Z → A</option><option value="soLuong:-1">Tồn kho giảm dần</option><option value="muc:1">Mức tồn tăng dần</option><option value="muc:-1">Mức tồn giảm dần</option><option value="maHang:-1">Mã hàng Z → A</option><option value="maHang:1">Mã hàng A → Z</option>{hasSpecs && <><option value="congSuatW:1">Công suất tăng dần</option><option value="congSuatW:-1">Công suất giảm dần</option></>}</select>
          <div className="sales-view-switch" role="group" aria-label="Cách xem sản phẩm"><button type="button" aria-pressed={view === "grid"} aria-label="Xem dạng thẻ" title="Xem dạng thẻ" onClick={() => setView("grid")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z" /></svg></button><button type="button" aria-pressed={view === "table"} aria-label="Xem dạng bảng" title="Xem dạng bảng" onClick={() => setView("table")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16" /></svg></button></div>
        </div>
      </div>
      <div className="sales-results"><span><i className="sales-result-dot" />{category === "all" ? "Tất cả sản phẩm" : category}</span><span>{count("critical")} mặt hàng dưới ngưỡng{filtered && <button type="button" className="btn-link" onClick={() => { setQ(""); setCategory("all"); setFilter("all"); setSupplyFilter("all"); setPower("all"); }}>Xóa bộ lọc</button>}</span></div>
      {!shown.length ? <div className="card"><Empty>{items.length ? "Không có mặt hàng nào khớp bộ lọc." : "Chưa có dữ liệu tồn kho."}</Empty></div> : view === "grid" ?
        <div className="product-grid">{shown.map((item) => <ProductCard key={item.maHang} item={item} online={online} supply={supply.get(item.maHang)} inCart={inCart(item.maHang)} onAdd={onAdd} />)}</div> :
        <div className="card sales-table"><div className="table-wrap"><table><thead><tr><SortTh k="maHang" {...th}>Mã hàng</SortTh><SortTh k="tenHang" {...th}>Tên hàng</SortTh>{hasSpecs && <SortTh k="congSuatW" num {...th}>Công suất</SortTh>}<SortTh k="giaBanLe" num {...th}>Giá bán lẻ</SortTh><SortTh k="soLuong" num {...th}>Tồn</SortTh><SortTh k="muc" {...th}>Mức tồn</SortTh><th scope="col">Số lượng</th></tr></thead><tbody>{shown.map((item) => <tr key={item.maHang} className={stockLevel(item.soLuong, item.nguong) === "critical" ? "low" : ""}>
          <td className="code">{item.maHang}</td><td><div className="with-thumb"><ProductImage src={item.anh} alt={item.tenHang} category={item.danhMuc} /><div>{item.tenHang}<div className="muted">{item.model && <span className="code-mono">{item.model}</span>}{item.model && item.danhMuc && " · "}{item.danhMuc}</div>{supply.has(item.maHang) && <Badge tone={supply.get(item.maHang)![0]}>{supply.get(item.maHang)![1]}</Badge>}</div></div></td>{hasSpecs && <td className="num nowrap code-mono">{fmtSpec.w(item.congSuatW) ?? <span className="muted">—</span>}</td>}<td className="num nowrap">{fmtMoney(item.giaBanLe)}</td><td className="num"><b>{fmtNumber(item.soLuong)}</b></td><td><StockBar soLuong={item.soLuong} nguong={item.nguong} /><small className="muted">{LEVEL_LABEL[stockLevel(item.soLuong, item.nguong)]}</small></td><td><StockQuantity item={item} online={online} inCart={inCart(item.maHang)} onAdd={onAdd} /></td>
        </tr>)}</tbody></table></div></div>}
    </section>
  </div>;
}

function ProductCard({ item, online, supply, inCart, onAdd }: { item: BranchItem; supply?: [string, string]; inCart: number } & Pick<Props, "online" | "onAdd">) {
  const level = stockLevel(item.soLuong, item.nguong);
  return <article className="product-card" aria-label={`${item.maHang} ${item.tenHang}`}>
    <div className="product-card-image"><ProductImage src={item.anh} alt={item.tenHang} category={item.danhMuc} size={160} fit="contain" /><span className={`product-stock-label ${item.soLuong === 0 ? "sold-out" : ""}`}>{item.soLuong > 0 ? `Còn ${fmtNumber(item.soLuong)}` : "Hết hàng"}</span></div>
    <div className="product-card-body"><div className="product-card-code"><span className="code-mono">{item.maHang}</span><span className="code-mono">{item.model}</span></div><h3 title={item.tenHang}>{item.tenHang}</h3><SpecChips congSuatW={item.congSuatW} dienApV={item.dienApV} trongLuongKg={item.trongLuongKg} /><div className="product-card-price">{fmtMoney(item.giaBanLe)}</div><div className="product-card-status">{level === "critical" ? <Badge tone="danger">Sắp hết</Badge> : <Badge tone={level === "warning" ? "warn" : level === "unset" ? "muted" : "success"}>{LEVEL_LABEL[level]}</Badge>}{supply && <Badge tone={supply[0]}>{supply[1]}</Badge>}</div><StockQuantity item={item} online={online} inCart={inCart} onAdd={onAdd} /></div>
  </article>;
}

function StockQuantity({ item, online, inCart, onAdd }: { item: BranchItem; inCart: number } & Pick<Props, "online" | "onAdd">) {
  const [quantity, setQuantity] = useState("1");
  const amount = Number(quantity);
  const invalid = !online || item.giaBanLe == null || !Number.isSafeInteger(amount) || amount < 1 || amount + inCart > item.soLuong;
  return <div className="stock-quantity"><div className="stock-quantity-controls"><input type="number" min={1} max={Math.max(0, item.soLuong - inCart)} value={quantity} aria-label={`Số lượng bán ${item.maHang}`} onChange={(event) => setQuantity(event.target.value)} /><button type="button" className="btn btn-primary" disabled={invalid} onClick={() => { onAdd(item, amount); setQuantity("1"); }}>+ Thêm vào giỏ</button></div>{inCart > 0 && <small className="stock-quantity-note">Trong giỏ: {inCart}</small>}</div>;
}
