"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { Branch, Product } from "@/lib/types";
import { Badge, Card, Empty, FilterBar, LEVEL_LABEL, SortTh, sortRows, stockLevel, type Sort, type StockLevel } from "@/components/ui";

type Row = { maCn: string; tenCn: string; maSp: string; tenSp: string; soLuong: number; nguongToiThieu: number };
type Key = "maCn" | "maSp" | "soLuong" | "nguongToiThieu";
const TONE: Record<StockLevel, string> = { critical: "danger", warning: "warn", ok: "success", unset: "muted" };

export function AdminThresholds({ products, branches, version }: { products: Product[]; branches: Branch[]; version: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort<Key>>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api<Row[]>("/api/stock/branches").then((data) => { if (active) setRows(data); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version, refresh]);
  const allowed = new Set(branches.map((item) => item.maCn));
  const productById = new Map(products.map((product) => [product.maSp, product]));
  const categories = [...new Map(products.map((product) => [product.maDm, product.tenDm])).entries()];
  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = sortRows(rows.filter((row) => allowed.has(row.maCn)
    && (!branch || row.maCn === branch)
    && (!level || stockLevel(row.soLuong, row.nguongToiThieu) === level)
    && (!category || productById.get(row.maSp)?.maDm === category)
    && (!needle || [row.maCn, row.tenCn, row.maSp, row.tenSp, productById.get(row.maSp)?.model].join(" ").toLocaleLowerCase("vi").includes(needle))),
    sort, (row, key) => row[key]);
  const th = { sort, onSort: setSort };

  return <>
    <p className="note" style={{ marginBottom: 16 }}>Theo dõi ngưỡng cảnh báo và mức tồn của từng mặt hàng tại các chi nhánh.</p>
    <FilterBar active={!!(query || branch || level || category)} onClear={() => { setQuery(""); setBranch(""); setLevel(""); setCategory(""); }}>
      <label className="field filterbar-search">Tìm kiếm<input type="search" value={query} placeholder="Chi nhánh, mã hoặc tên hàng" onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="field">Chi nhánh<select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">Tất cả chi nhánh</option>{branches.map((item) => <option key={item.maCn} value={item.maCn}>{item.maCn} · {item.ten}</option>)}</select></label>
      <label className="field">Danh mục<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tất cả danh mục</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="field">Mức tồn<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Tất cả</option>{Object.entries(LEVEL_LABEL).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </FilterBar>
    <Card title={<>Ngưỡng tối thiểu <span className="muted">· {shown.length} mặt hàng tại chi nhánh</span></>}
      actions={<button type="button" className="btn btn-sm" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Tải lại</button>}>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && !rows.length ? <p className="note" role="status">Đang tải ngưỡng tồn kho...</p> : !shown.length ? <Empty>Không có mặt hàng nào khớp bộ lọc.</Empty> : <div className="table-wrap"><table>
        <thead><tr><SortTh k="maCn" {...th}>Chi nhánh</SortTh><SortTh k="maSp" {...th}>Mặt hàng</SortTh><SortTh k="soLuong" num {...th}>Tồn hiện tại</SortTh><SortTh k="nguongToiThieu" num {...th}>Ngưỡng tối thiểu</SortTh><th scope="col">Mức tồn</th></tr></thead>
        <tbody>{shown.map((row) => { const status = stockLevel(row.soLuong, row.nguongToiThieu); return <tr key={`${row.maCn}-${row.maSp}`}><td><b>{row.maCn}</b><div className="muted">{row.tenCn}</div></td><td><span className="code">{row.maSp}</span> {row.tenSp}</td><td className="num">{fmtNumber(row.soLuong)}</td><td className="num">{fmtNumber(row.nguongToiThieu)}</td><td><Badge tone={TONE[status]}>{LEVEL_LABEL[status]}</Badge></td></tr>; })}</tbody>
      </table></div>}
    </Card>
  </>;
}
