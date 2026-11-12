"use client";

import { useEffect, useState } from "react";
import { api, today } from "@/lib/api";
import type { BusinessSummary } from "@/lib/types";
import { Card, Empty } from "@/components/ui";
import { BranchChart, HorizontalBars } from "./BusinessCharts";

export function OverviewStatistics({ version, onSeeAll }: { version: number; onSeeAll: (part: "products" | "branches") => void }) {
  const [data, setData] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const from = today(-29);
  const to = today();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ from, to });
    api<BusinessSummary>(`/api/business/summary?${query}`)
      .then((result) => { if (active) setData(result); })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, version, retry]);

  const dateLabel = (date: string) => date.split("-").reverse().join("/");
  const seeAll = (part: "products" | "branches") => <button type="button" className="btn-link" onClick={() => onSeeAll(part)}>Xem tất cả →</button>;

  return <section className="overview-statistics" aria-label="Thống kê kinh doanh" aria-busy={loading}>
    <p className="muted">30 ngày gần nhất · {dateLabel(data?.from ?? from)} – {dateLabel(data?.to ?? to)}</p>
      {loading && <p className="muted" role="status">Đang tải thống kê...</p>}
      {error && <div className="banner banner-danger" role="alert">
        <p>Không tải được thống kê: {error}{data ? ". Đang hiển thị dữ liệu lần tải trước." : ""}</p>
        <button type="button" className="btn btn-sm" disabled={loading} onClick={() => setRetry((value) => value + 1)}>Thử lại</button>
      </div>}
      {data && <div className="grid grid-2">
        <Card title="Top 5 sản phẩm theo doanh thu" actions={seeAll("products")}>
          <HorizontalBars rows={data.products.slice(0, 5).map((product) => ({ ten: product.ten, doanhThu: product.doanhThu }))} />
        </Card>
        {data.branches.length ? <BranchChart rows={data.branches.slice(0, 5)} title="Top 5 chi nhánh" actions={seeAll("branches")} />
          : <Card title={<>Top 5 chi nhánh <span className="muted">· sell-in và bán ra</span></>} actions={seeAll("branches")}><Empty>Chưa có dữ liệu chi nhánh trong kỳ.</Empty></Card>}
      </div>}
  </section>;
}
