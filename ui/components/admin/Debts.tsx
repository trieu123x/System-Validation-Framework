"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, DEBT_LABEL, DEBT_TONE, ENTRY_LABEL, fmtMoney } from "@/lib/api";
import type { BranchDebt, DebtEntry, DebtSummary, SupplierDebt } from "@/lib/types";
import { Badge, Card, Empty, Stat, useAction } from "@/components/ui";

type Push = (l: string, t: string) => void;
type Ledger<T> = { tongHop: T; butToan: DebtEntry[] };

/** Tab Công nợ: chi nhánh nợ công ty (phiếu thu, hạn mức) và công ty nợ nhà cung cấp (phiếu chi). */
export function Debts({ version, showSim, push }: { version: number; showSim: boolean; push: Push }) {
  const [part, setPart] = useState<"branches" | "suppliers">("branches");
  const [sum, setSum] = useState<DebtSummary | null>(null);
  const [mine, setMine] = useState(0);
  const reload = () => setMine((x) => x + 1);

  useEffect(() => {
    api<DebtSummary>("/api/debts/summary").then(setSum).catch(() => {});
  }, [version, mine]);

  const owing = sum ? sum.conNoCn : null;
  return (
    <>
      <div className="kpis">
        <Stat label="Tổng tiền nhập" value={fmtMoney(sum?.tongNhap)} hint={`đã trả NCC ${fmtMoney(sum?.daTraNcc)}`} />
        <Stat label="Tổng tiền xuất cho chi nhánh" value={fmtMoney(sum?.tongXuat)} hint={`đã thu ${fmtMoney(sum?.daThuCn)}`} />
        <Stat label="Chi nhánh còn nợ" value={fmtMoney(owing)} tone={owing ? "warn" : undefined}
          hint="xem chi nhánh" onClick={() => setPart("branches")} />
        <Stat label="Công ty còn nợ nhà cung cấp" value={fmtMoney(sum?.conNoNcc)} tone={sum?.conNoNcc ? "danger" : undefined}
          hint="xem nhà cung cấp" onClick={() => setPart("suppliers")} />
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <button className={`btn ${part === "branches" ? "btn-primary" : ""}`} onClick={() => setPart("branches")}>Chi nhánh</button>
        <button className={`btn ${part === "suppliers" ? "btn-primary" : ""}`} onClick={() => setPart("suppliers")}>Nhà cung cấp</button>
      </div>
      {part === "branches"
        ? <BranchDebts version={version + mine} showSim={showSim} push={push} changed={reload} />
        : <SupplierDebts version={version + mine} push={push} changed={reload} />}
    </>
  );
}

function BranchDebts({ version, showSim, push, changed }: { version: number; showSim: boolean; push: Push; changed: () => void }) {
  const [rows, setRows] = useState<BranchDebt[]>([]);
  const [state, setState] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    api<BranchDebt[]>(`/api/debts/branches?sim=${showSim}`).then(setRows).catch(() => {});
  }, [version, showSim]);

  const count = (s: string) => rows.filter((r) => r.trangThai === s).length;
  const shown = state ? rows.filter((r) => r.trangThai === state) : rows;

  return (
    <div className="grid grid-2">
      <Card title={<>Công nợ chi nhánh <span className="muted">· {shown.length} chi nhánh</span></>}
        actions={(
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Lọc theo trạng thái">
            <option value="">Tất cả trạng thái ({rows.length})</option>
            {Object.keys(DEBT_LABEL).map((s) => <option key={s} value={s}>{DEBT_LABEL[s]} ({count(s)})</option>)}
          </select>
        )}>
        {shown.length === 0 ? <Empty>Không có chi nhánh nào.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chi nhánh</th><th className="num">Tổng nhận</th><th className="num">Đã trả</th>
                  <th className="num">Còn nợ</th><th className="num">Hạn mức</th><th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.maCn} className={`clickable ${sel === r.maCn ? "warn" : r.trangThai === "VUOT_HAN_MUC" ? "low" : ""}`}
                    onClick={() => setSel(r.maCn)}>
                    <td className="nowrap"><b>{r.maCn}</b> <span className="muted">{r.tenCn}</span></td>
                    <td className="num nowrap">{fmtMoney(r.tongNhan)}</td>
                    <td className="num nowrap">{fmtMoney(r.daTra)}</td>
                    <td className="num nowrap"><b>{fmtMoney(r.conNo)}</b></td>
                    <td className="num nowrap muted">{fmtMoney(r.hanMuc)}</td>
                    <td><Badge tone={DEBT_TONE[r.trangThai]}>{DEBT_LABEL[r.trangThai]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel ? <BranchLedger maCn={sel} version={version} push={push} changed={changed} />
        : <Card title="Sổ chi tiết"><Empty>Bấm vào một chi nhánh để xem sổ, ghi phiếu thu hoặc sửa hạn mức.</Empty></Card>}
    </div>
  );
}

function BranchLedger({ maCn, version, push, changed }: { maCn: string; version: number; push: Push; changed: () => void }) {
  const { run, busy } = useAction(push);
  const [data, setData] = useState<Ledger<BranchDebt> | null>(null);
  const [form, setForm] = useState<"pay" | "limit" | null>(null);
  const [soTien, setSoTien] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  useEffect(() => {
    api<Ledger<BranchDebt>>(`/api/debts/branches/${encodeURIComponent(maCn)}`).then(setData).catch(() => setData(null));
  }, [maCn, version]);
  useEffect(() => { setForm(null); setSoTien(""); setGhiChu(""); }, [maCn]);

  const t = data?.tongHop;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = form === "pay"
      ? await run(() => api(`/api/debts/branches/${encodeURIComponent(maCn)}/payments`, { soTien, ghiChu }),
        `Đã ghi phiếu thu ${fmtMoney(Number(soTien))} của ${maCn}`)
      : await run(() => api(`/api/branches/${encodeURIComponent(maCn)}/credit-limit`, { hanMuc: soTien }, "PUT"),
        `Đã đặt hạn mức ${maCn} = ${fmtMoney(Number(soTien))}`);
    if (ok) {
      setForm(null);
      setSoTien("");
      setGhiChu("");
      changed();
    }
  };

  return (
    <Card title={<>Sổ công nợ {maCn} {t && <span className="muted">· {t.tenCn}</span>}</>}
      actions={t && (
        <>
          <button className="btn btn-sm btn-success" disabled={t.conNo <= 0}
            onClick={() => { setForm("pay"); setSoTien(String(t.conNo)); }}>Ghi phiếu thu</button>{" "}
          <button className="btn btn-sm" onClick={() => { setForm("limit"); setSoTien(String(t.hanMuc)); }}>Sửa hạn mức</button>
        </>
      )}>
      {!t ? <Empty>Đang tải...</Empty> : (
        <>
          <div className="kpis">
            <Stat label="Tổng nhận" value={fmtMoney(t.tongNhan)} />
            <Stat label="Đã trả" value={fmtMoney(t.daTra)} />
            <Stat label="Còn nợ" value={fmtMoney(t.conNo)} tone={DEBT_TONE[t.trangThai]}
              hint={<Badge tone={DEBT_TONE[t.trangThai]}>{DEBT_LABEL[t.trangThai]}</Badge>} />
            <Stat label="Hạn mức" value={fmtMoney(t.hanMuc)} />
          </div>
          {form && (
            <form className="filterbar" onSubmit={submit}>
              <label className="field">{form === "pay" ? "Số tiền thu (đ)" : "Hạn mức mới (đ)"}
                <input type="number" min={form === "pay" ? 1 : 0} max={form === "pay" ? t.conNo : undefined} step={1}
                  required value={soTien} onChange={(e) => setSoTien(e.target.value)} />
              </label>
              {form === "pay" && (
                <label className="field">Ghi chú
                  <input value={ghiChu} maxLength={255} placeholder="Chuyển khoản, tiền mặt..."
                    onChange={(e) => setGhiChu(e.target.value)} />
                </label>
              )}
              <button className="btn btn-primary" disabled={busy}>Lưu</button>
              <button type="button" className="btn" onClick={() => setForm(null)}>Bỏ qua</button>
            </form>
          )}
          <EntryTable rows={data.butToan} />
        </>
      )}
    </Card>
  );
}

function SupplierDebts({ version, push, changed }: { version: number; push: Push; changed: () => void }) {
  const [rows, setRows] = useState<SupplierDebt[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    api<SupplierDebt[]>("/api/debts/suppliers").then(setRows).catch(() => {});
  }, [version]);

  return (
    <div className="grid grid-2">
      <Card title={<>Công nợ nhà cung cấp <span className="muted">· {rows.length} nhà cung cấp</span></>}>
        {rows.length === 0 ? <Empty>Chưa có nhà cung cấp.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nhà cung cấp</th><th className="num">Tổng nhập</th><th className="num">Đã trả</th><th className="num">Còn nợ</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.maNcc} className={`clickable ${sel === r.maNcc ? "warn" : ""}`} onClick={() => setSel(r.maNcc)}>
                    <td><b>{r.maNcc}</b> <span className="muted">{r.ten}</span></td>
                    <td className="num nowrap">{fmtMoney(r.tongNhap)}</td>
                    <td className="num nowrap">{fmtMoney(r.daTra)}</td>
                    <td className="num nowrap">
                      {r.conNo > 0 ? <b>{fmtMoney(r.conNo)}</b> : <Badge tone="success">Đã trả đủ</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sel ? <SupplierLedger maNcc={sel} version={version} push={push} changed={changed} />
        : <Card title="Sổ chi tiết"><Empty>Bấm vào một nhà cung cấp để xem phiếu nhập, phiếu chi và ghi phiếu chi.</Empty></Card>}
    </div>
  );
}

function SupplierLedger({ maNcc, version, push, changed }: { maNcc: string; version: number; push: Push; changed: () => void }) {
  const { run, busy } = useAction(push);
  const [data, setData] = useState<Ledger<SupplierDebt> | null>(null);
  const [open, setOpen] = useState(false);
  const [soTien, setSoTien] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  useEffect(() => {
    api<Ledger<SupplierDebt>>(`/api/debts/suppliers/${encodeURIComponent(maNcc)}`).then(setData).catch(() => setData(null));
  }, [maNcc, version]);
  useEffect(() => { setOpen(false); setSoTien(""); setGhiChu(""); }, [maNcc]);

  const t = data?.tongHop;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api(`/api/debts/suppliers/${encodeURIComponent(maNcc)}/payments`, { soTien, ghiChu }),
      `Đã ghi phiếu chi ${fmtMoney(Number(soTien))} cho ${maNcc}`)) {
      setOpen(false);
      setSoTien("");
      setGhiChu("");
      changed();
    }
  };

  return (
    <Card title={<>Sổ nhà cung cấp {maNcc} {t && <span className="muted">· {t.ten}</span>}</>}
      actions={t && (
        <button className="btn btn-sm btn-success" disabled={t.conNo <= 0}
          onClick={() => { setOpen(true); setSoTien(String(t.conNo)); }}>Ghi phiếu chi</button>
      )}>
      {!t ? <Empty>Đang tải...</Empty> : (
        <>
          <div className="kpis">
            <Stat label="Tổng nhập" value={fmtMoney(t.tongNhap)} />
            <Stat label="Đã trả" value={fmtMoney(t.daTra)} />
            <Stat label="Còn nợ" value={fmtMoney(t.conNo)} tone={t.conNo > 0 ? "danger" : "success"} />
          </div>
          {open && (
            <form className="filterbar" onSubmit={submit}>
              <label className="field">Số tiền chi (đ)
                <input type="number" min={1} max={t.conNo} step={1} required value={soTien}
                  onChange={(e) => setSoTien(e.target.value)} />
              </label>
              <label className="field">Ghi chú
                <input value={ghiChu} maxLength={255} onChange={(e) => setGhiChu(e.target.value)} />
              </label>
              <button className="btn btn-primary" disabled={busy}>Lưu</button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Bỏ qua</button>
            </form>
          )}
          <EntryTable rows={data.butToan} />
        </>
      )}
    </Card>
  );
}

/** Bảng bút toán; chiều (+/−) suy ra từ loại. */
export function EntryTable({ rows }: { rows: { id: number | string; loai: string; soTien: number; ghiChu: string | null; thoiGian: string }[] }) {
  if (rows.length === 0) return <Empty>Chưa có bút toán nào.</Empty>;
  return (
    <div className="table-wrap scroll" style={{ maxHeight: 420 }}>
      <table>
        <thead><tr><th>Thời gian</th><th>Loại</th><th>Diễn giải</th><th className="num">Số tiền</th></tr></thead>
        <tbody>
          {rows.map((b) => {
            const [label, sign] = ENTRY_LABEL[b.loai] ?? [b.loai, "+"];
            return (
              <tr key={`${b.loai}-${b.id}`}>
                <td className="muted nowrap">{b.thoiGian.slice(0, 16)}</td>
                <td className="nowrap"><Badge tone={sign === "+" ? "warn" : "success"}>{label}</Badge></td>
                <td>{b.ghiChu}</td>
                <td className="num nowrap" style={{ color: sign === "+" ? "var(--danger)" : "var(--success)" }}>
                  {sign}{fmtMoney(b.soTien)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
