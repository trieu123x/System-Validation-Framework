"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney } from "@/lib/api";
import type { BusinessBranch } from "@/lib/types";
import { Card, Empty } from "@/components/ui";
import "./business.css";

const REVENUE = "#245bd6";
const SELL_OUT = "#1a9b8a";
const GRID = "#e4e9f0";
const AXIS = "#536176";
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const clip = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const moneyTip = (v: unknown) => fmtMoney(Number(v));

export function HorizontalBars({ rows }: { rows: { ten: string; doanhThu: number }[] }) {
  if (rows.length === 0) return <Empty>Chưa có doanh thu.</Empty>;
  return (
    <div className="biz-bars" style={{ height: Math.max(120, rows.length * 30 + 30) }}
      role="img" aria-label={rows.map((r) => `${r.ten}: ${fmtMoney(r.doanhThu)}`).join("; ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
          <YAxis type="category" dataKey="ten" width={150} tickFormatter={(v: string) => clip(v)} stroke={AXIS}
            tick={{ fontSize: 12 }} tickLine={false} />
          <Tooltip formatter={moneyTip} cursor={{ fill: "#f4f7fd" }} />
          <Bar dataKey="doanhThu" name="Doanh thu" fill={REVENUE} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** So sánh chi nhánh: sell-in (công ty xuất cho chi nhánh) cạnh sell-out (chi nhánh bán cho khách). */
export function BranchChart({ rows, title, actions }: { rows: BusinessBranch[]; title: string; actions?: ReactNode }) {
  const data = rows.map((b) => ({ ten: b.ten, maCn: b.maCn, doanhThu: b.doanhThu, sellOut: b.sellOutDoanhThu }));
  return (
    <Card title={<>{title} <span className="muted">· sell-in và bán ra</span></>} actions={actions}>
      <div className="biz-bars" style={{ height: Math.max(160, data.length * 34 + 50) }}
        role="img" aria-label={data.map((b) => `${b.ten}: nhập ${fmtMoney(b.doanhThu)}, bán ra ${fmtMoney(b.sellOut)}`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8} barGap={2}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis type="category" dataKey="ten" width={170} tickFormatter={(v: string) => clip(v.replace(/^Chi nhánh /, ""), 24)}
              stroke={AXIS} tick={{ fontSize: 12 }} tickLine={false} />
            <Tooltip formatter={moneyTip} cursor={{ fill: "#f4f7fd" }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} />
            <Bar dataKey="doanhThu" name="Sell-in (công ty xuất)" fill={REVENUE} radius={[0, 4, 4, 0]} maxBarSize={11} />
            <Bar dataKey="sellOut" name="Bán ra (sell-out)" fill={SELL_OUT} radius={[0, 4, 4, 0]} maxBarSize={11} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
