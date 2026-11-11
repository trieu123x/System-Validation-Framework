"use client";

import { ProductImage } from "@/components/ui";
import type { CSSProperties } from "react";

export type CatalogCategory = { id: string; label: string; count: number; image?: string | null };

export function CatalogBrand() {
  return <section className="store-brand-panel" aria-label="Thương hiệu TOBOKI">
    <div className="store-brand-wordmark">TOBOKI</div><p>Thiết bị & máy móc</p>
  </section>;
}

/** Catalog groups derived from the current workspace's products. */
export function CatalogDiscovery({ categories, selected, onSelect, variant = "grid", allCategory }: {
  categories: CatalogCategory[]; selected: string; onSelect: (id: string) => void;
  variant?: "grid" | "sidebar"; allCategory?: CatalogCategory;
}) {
  if (!categories.length) return null;
  const columns = (maximum: number) => Math.ceil(categories.length / Math.ceil(categories.length / maximum));
  const gridStyle = {
    "--category-columns": columns(5),
    "--category-columns-tablet": columns(3),
  } as CSSProperties;
  const choices = allCategory ? [allCategory, ...categories] : categories;
  return <section className={`trade-discovery${variant === "sidebar" ? " trade-discovery-sidebar" : ""}`} aria-label="Khám phá danh mục hàng hóa">
    <div className="trade-category-heading"><h2>Danh mục sản phẩm</h2><span>{categories.length} nhóm thiết bị</span></div>
    <div className="trade-category-grid" style={gridStyle}>{choices.map((category) => <button type="button" key={category.id} className={selected === category.id ? "is-selected" : ""} aria-pressed={selected === category.id} onClick={() => onSelect(category.id)}>
      <span className="trade-category-image">{category.id === allCategory?.id ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z" /></svg> : <ProductImage src={category.image} alt="" category={category.label} size={110} fit="contain" />}</span><span className="trade-category-copy"><strong>{category.label}</strong><small>{category.count} mặt hàng</small></span>
    </button>)}</div>
  </section>;
}
