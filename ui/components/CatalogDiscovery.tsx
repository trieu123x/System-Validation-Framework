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
export function CatalogDiscovery({ categories, selected, onSelect }: {
  categories: CatalogCategory[]; selected: string; onSelect: (id: string) => void;
}) {
  if (!categories.length) return null;
  const columns = (maximum: number) => Math.ceil(categories.length / Math.ceil(categories.length / maximum));
  const gridStyle = {
    "--category-columns": columns(5),
    "--category-columns-tablet": columns(3),
  } as CSSProperties;
  return <section className="trade-discovery" aria-label="Khám phá danh mục hàng hóa">
    <div className="trade-category-heading"><h2>Danh mục sản phẩm</h2><span>{categories.length} nhóm thiết bị</span></div>
    <div className="trade-category-grid" style={gridStyle}>{categories.map((category) => <button type="button" key={category.id} className={selected === category.id ? "is-selected" : ""} aria-pressed={selected === category.id} onClick={() => onSelect(category.id)}>
      <span className="trade-category-image"><ProductImage src={category.image} alt="" category={category.label} size={110} fit="contain" /></span><span className="trade-category-copy"><strong>{category.label}</strong><small>{category.count} mặt hàng</small></span>
    </button>)}</div>
  </section>;
}
