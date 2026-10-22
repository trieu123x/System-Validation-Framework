"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Branch, LogRow } from "@/lib/types";
import { Card, Empty } from "@/components/ui";

/** Giám sát giao thức realtime + tra cứu nhật ký (FR-25). */
export function Monitor({ live, branches, clearLive }: { live: LogRow[]; branches: Branch[]; clearLive: () => void }) {
  const [maCn, setMaCn] = useState("");
  const [lenh, setLenh] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<LogRow[]>([]);

  useEffect(() => {
    const q = new URLSearchParams({ maCn, lenh, limit: "300" }).toString();
    api<LogRow[]>(`/api/logs?${q}`).then(setRows).catch(() => {});
  }, [maCn, lenh]);

  const shown = (paused ? frozen : live).filter((m) => (!maCn || m.maCn === maCn) && (!lenh || m.lenh === lenh));

  return (
    <div className="grid grid-2">
      <Card title="Luồng tin trực tiếp" actions={
        <>
          <button className="btn btn-sm" onClick={() => { setFrozen(live); setPaused(!paused); }}>
            {paused ? "Tiếp tục" : "Tạm dừng"}
          </button>
          <button className="btn btn-sm" onClick={clearLive}>Xoá</button>
        </>
      }>
        <Filters branches={branches} maCn={maCn} setMaCn={setMaCn} lenh={lenh} setLenh={setLenh} />
        {shown.length === 0 ? <Empty>Chưa có tin nào kể từ khi mở trang.</Empty> : <Feed rows={shown} />}
      </Card>
      <Card title="Nhật ký trong CSDL (nhat_ky)">
        <p className="note">300 tin gần nhất theo bộ lọc bên trái, thời điểm tới mili-giây.</p>
        {rows.length === 0 ? <Empty>Không có bản ghi.</Empty> : <Feed rows={rows} />}
      </Card>
    </div>
  );
}

function Filters({ branches, maCn, setMaCn, lenh, setLenh }: {
  branches: Branch[]; maCn: string; setMaCn: (v: string) => void; lenh: string; setLenh: (v: string) => void;
}) {
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <select value={maCn} onChange={(e) => setMaCn(e.target.value)} aria-label="Lọc chi nhánh">
        <option value="">Mọi chi nhánh</option>
        {branches.map((b) => <option key={b.maCn} value={b.maCn}>{b.maCn}</option>)}
      </select>
      <input placeholder="Lệnh (VD: SALE)" value={lenh} onChange={(e) => setLenh(e.target.value.toUpperCase().trim())} />
    </div>
  );
}

function Feed({ rows }: { rows: LogRow[] }) {
  return (
    <div className="feed">
      {rows.map((m, i) => (
        <div key={(m.id ?? "") + m.thoiGian + i}>
          <span className="muted">{m.thoiGian.slice(11)}</span>{" "}
          <span className={m.chieu === "IN" ? "in" : "out"}>{m.chieu === "IN" ? "→S" : "S→"}</span>{" "}
          <b>{m.maCn ?? "?"}</b> {m.noiDung}
        </div>
      ))}
    </div>
  );
}
