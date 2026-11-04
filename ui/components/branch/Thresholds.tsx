"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber } from "@/lib/api";
import type { BranchItem } from "@/lib/types";
import { Badge, Card, Empty, FilterBar, ProductImage, SortTh, sortRows, useAction, type Sort } from "@/components/ui";

type Props = { items: BranchItem[]; online: boolean; push: (level: string, text: string) => void };
type Key = "maHang" | "tenHang" | "soLuong" | "nguong";

export function Thresholds({ items, online, push }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort<Key>>(null);
  const { run, busy } = useAction(push);
  const needle = query.trim().toLocaleLowerCase("vi");
  const categories = [...new Set(items.map((item) => item.danhMuc).filter(Boolean))];
  const shown = sortRows(items.filter((item) =>
    (!needle || [item.maHang, item.tenHang, item.model].join(" ").toLocaleLowerCase("vi").includes(needle))
    && (!category || item.danhMuc === category)
    && (!filter || (filter === "unset" ? item.nguong === 0 : item.nguong > 0 && item.soLuong < item.nguong))),
    sort, (item, key) => item[key]);
  const th = { sort, onSort: setSort };

  return <>
    <p className="note" style={{ marginBottom: 16 }}>Đặt 0 để tắt cảnh báo.</p>
    <FilterBar active={!!(query || category || filter)} onClear={() => { setQuery(""); setCategory(""); setFilter(""); }}>
      <label className="field filterbar-search">Tìm sản phẩm<input type="search" placeholder="Mã, tên hoặc model" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      {categories.length > 0 && <label className="field">Danh mục<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Tất cả danh mục</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label>}
      <label className="field">Trạng thái<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Tất cả</option><option value="unset">Chưa đặt ngưỡng</option><option value="low">Đang dưới ngưỡng</option></select></label>
    </FilterBar>
    <Card title={<>Ngưỡng cảnh báo tồn kho <span className="muted">· {shown.length} mặt hàng</span></>}
      actions={<button className="btn btn-sm" disabled={!online || busy} onClick={() => run(() => api("/api/inventory/refresh", {}))}>Tải lại</button>}>
      {!online && <p className="note">Kết nối lại để lưu ngưỡng.</p>}
      {!shown.length ? <Empty>Không có mặt hàng nào khớp bộ lọc.</Empty> : <div className="table-wrap"><table>
        <thead><tr><SortTh k="maHang" {...th}>Mã hàng</SortTh><SortTh k="tenHang" {...th}>Sản phẩm</SortTh><SortTh k="soLuong" num {...th}>Tồn hiện tại</SortTh><SortTh k="nguong" {...th}>Ngưỡng tối thiểu</SortTh><th>Trạng thái</th></tr></thead>
        <tbody>{shown.map((item) => <ThresholdRow key={item.maHang} item={item} online={online} push={push} />)}</tbody>
      </table></div>}
    </Card>
  </>;
}

function ThresholdRow({ item, online, push }: { item: BranchItem } & Pick<Props, "online" | "push">) {
  const [value, setValue] = useState(String(item.nguong));
  const { run, busy } = useAction(push);
  useEffect(() => setValue(String(item.nguong)), [item.nguong]);
  const threshold = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(threshold) && threshold >= 0 && threshold <= 2147483647;
  const save = () => {
    if (!valid || !online || busy || threshold === item.nguong) return;
    void run(() => api("/api/threshold", { maHang: item.maHang, nguong: threshold }), `Đã lưu ngưỡng ${item.maHang}: ${threshold}`);
  };
  return <tr>
    <td className="code">{item.maHang}</td>
    <td><div className="with-thumb"><ProductImage src={item.anh} alt={item.tenHang} category={item.danhMuc} /><div>{item.tenHang}<div className="muted" style={{ fontSize: 12 }}>{[item.model, item.danhMuc].filter(Boolean).join(" · ")}</div></div></div></td>
    <td className="num">{fmtNumber(item.soLuong)}</td>
    <td><form className="qty-group" onSubmit={(event) => { event.preventDefault(); save(); }}><input type="number" min={0} max={2147483647} step={1} value={value} disabled={!online || busy} aria-label={`Ngưỡng ${item.maHang}`} onChange={(event) => setValue(event.target.value)} /><button className="btn btn-sm btn-primary" disabled={!online || busy || !valid || threshold === item.nguong}>{busy ? "Đang lưu..." : "Lưu"}</button></form></td>
    <td><Badge tone={item.nguong === 0 ? "muted" : item.soLuong < item.nguong ? "danger" : "success"}>{item.nguong === 0 ? "Chưa đặt ngưỡng" : item.soLuong < item.nguong ? "Dưới ngưỡng" : "Đã đặt ngưỡng"}</Badge></td>
  </tr>;
}
