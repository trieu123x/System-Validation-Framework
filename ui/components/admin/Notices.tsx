"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, fmtMoney, fmtNumber, NOTICE_STATE_LABEL, NOTICE_STATE_TONE, NOTICE_TYPE_LABEL, STATE_LABEL } from "@/lib/api";
import type { Branch, NoticeDetail, NoticeRow, NoticeSuggestion, NoticeType, Product } from "@/lib/types";
import { Badge, Card, Dot, Empty, ProductImage, useAction } from "@/components/ui";

type Push = (l: string, t: string) => void;

const TYPE_TONE: Record<NoticeType, string> = { TIN: "muted", HOI_NHU_CAU: "warn", SP_MOI: "info" };

function defaultTitle(loai: NoticeType, p: Product | undefined): string {
  if (!p) return "";
  return loai === "HOI_NHU_CAU" ? `Chi nhánh có cần thêm ${p.ten}?` : loai === "SP_MOI" ? `Sản phẩm mới: ${p.ten}` : "";
}

/**
 * Thông báo tới chi nhánh: tin thường, hỏi nhu cầu (CN sắp chạm ngưỡng), giới thiệu sản phẩm mới.
 * Gửi tất cả hoặc chọn chi nhánh; chi nhánh trả lời "Cần hàng"/"Muốn nhập" thì server tạo YC ở Tổng quan.
 */
export function Notices({ products, branches, version, push }: {
  products: Product[]; branches: Branch[]; version: number; push: Push;
}) {
  const real = branches.filter((b) => !b.giaLap);
  const [loai, setLoai] = useState<NoticeType>("TIN");
  const [maSp, setMaSp] = useState("");
  const [tieuDe, setTieuDe] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [noiDung, setNoiDung] = useState("");
  const [soLuong, setSoLuong] = useState("");
  const [all, setAll] = useState(true);
  // maCn → số đề xuất riêng ("" = dùng số chung)
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [suggest, setSuggest] = useState<NoticeSuggestion[]>([]);
  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [mine, setMine] = useState(0);
  const { run, busy } = useAction(push);

  const product = products.find((p) => p.maSp === maSp);

  useEffect(() => {
    api<NoticeRow[]>("/api/notices").then(setRows).catch(() => {});
    api<NoticeSuggestion[]>("/api/notices/suggest").then(setSuggest).catch(() => {});
  }, [version, mine]);

  useEffect(() => {
    if (!titleEdited) setTieuDe(defaultTitle(loai, product));
  }, [loai, product, titleEdited]);

  const reset = () => {
    setTieuDe(""); setTitleEdited(false); setNoiDung(""); setSoLuong(""); setPicked({}); setAll(true);
  };

  /** Chọn đúng các CN sắp chạm ngưỡng của một mặt hàng, mỗi CN một số đề xuất. */
  const askFor = (sp: string, only?: string) => {
    const list = suggest.filter((s) => s.maSp === sp && (!only || s.maCn === only));
    setLoai("HOI_NHU_CAU");
    setMaSp(sp);
    setTitleEdited(false);
    setAll(false);
    setPicked(Object.fromEntries(list.map((s) => [s.maCn, String(s.deXuat)])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const chiNhanh = all ? null : Object.entries(picked).map(([maCn, d]) => ({ maCn, deXuat: d ? Number(d) : null }));
    let res: { tong: number; guiNgay: number } | null = null;
    const ok = await run(async () => {
      res = await api<{ tong: number; guiNgay: number }>("/api/notices", {
        loai, tieuDe, noiDung, maSp: loai === "TIN" ? "" : maSp, soLuongDeXuat: soLuong ? Number(soLuong) : null, chiNhanh,
      });
    });
    if (ok && res) {
      const r: { tong: number; guiNgay: number } = res;
      push("success", `Đã gửi tới ${r.tong} chi nhánh (${r.guiNgay} online nhận ngay, còn lại nhận khi đăng nhập)`);
      reset();
      setMine((x) => x + 1);
    }
  };

  const needProduct = loai !== "TIN";
  const count = all ? real.length : Object.keys(picked).length;
  const canSend = !busy && tieuDe.trim() !== "" && (!needProduct || maSp !== "") && count > 0;
  const forProduct = suggest.filter((s) => s.maSp === maSp);

  return (
    <>
      <div className="grid grid-2">
        <Card title="Soạn thông báo">
          <form onSubmit={send} className="form-stack">
            <div className="row" style={{ gap: 6 }} role="radiogroup" aria-label="Loại thông báo">
              {(["TIN", "HOI_NHU_CAU", "SP_MOI"] as NoticeType[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={loai === t}
                  className={`btn ${loai === t ? "btn-primary" : ""}`} onClick={() => { setLoai(t); setTitleEdited(false); }}>
                  {NOTICE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="note" style={{ margin: 0 }}>
              {loai === "TIN" && "Tin thường: chi nhánh chỉ đọc."}
              {loai === "HOI_NHU_CAU" && "Chi nhánh bấm “Cần hàng” kèm số lượng → server tạo yêu cầu cấp hàng, bạn duyệt ở Tổng quan."}
              {loai === "SP_MOI" && "Chi nhánh bấm “Muốn nhập” kèm số lượng → server thêm mặt hàng vào kho chi nhánh và tạo yêu cầu cấp hàng."}
            </p>

            {needProduct && (
              <div className="with-thumb">
                <ProductImage src={product?.anhUrl} alt={product?.ten ?? ""} category={product?.tenDm} size={56} />
                <label className="field" style={{ flex: 1 }}>Mặt hàng
                  <select value={maSp} onChange={(e) => setMaSp(e.target.value)} required>
                    <option value="">— Chọn mặt hàng —</option>
                    {products.map((p) => <option key={p.maSp} value={p.maSp}>{p.maSp} – {p.ten}</option>)}
                  </select>
                  {product && (
                    <span className="note">Giá xuất CN {fmtMoney(product.giaXuat)} · kho tổng còn {fmtNumber(product.tonTong)}</span>
                  )}
                </label>
              </div>
            )}

            <label className="field">Tiêu đề
              <input value={tieuDe} maxLength={150} required
                onChange={(e) => { setTieuDe(e.target.value); setTitleEdited(true); }} />
            </label>
            <label className="field">Nội dung
              <textarea rows={4} value={noiDung} maxLength={1000} onChange={(e) => setNoiDung(e.target.value)}
                placeholder="Có thể chứa dấu | và xuống dòng, chi nhánh vẫn hiển thị nguyên văn." />
            </label>
            {needProduct && (
              <label className="field" style={{ maxWidth: 260 }}>Số lượng đề xuất chung (tuỳ chọn)
                <input type="number" min={1} value={soLuong} onChange={(e) => setSoLuong(e.target.value)} />
              </label>
            )}

            <fieldset className="form-stack" style={{ border: "1px solid var(--border)", padding: 10, margin: 0 }}>
              <legend className="muted">Gửi tới</legend>
              <div className="row">
                <label className="row"><input type="radio" checked={all} onChange={() => setAll(true)} /> Tất cả chi nhánh ({real.length})</label>
                <label className="row"><input type="radio" checked={!all} onChange={() => setAll(false)} /> Chọn chi nhánh</label>
                {loai === "HOI_NHU_CAU" && maSp && (
                  <button type="button" className="btn btn-sm" disabled={forProduct.length === 0} onClick={() => askFor(maSp)}
                    title="Chọn các chi nhánh có tồn < 1,5 × ngưỡng và chưa có yêu cầu mở">
                    Chọn CN sắp chạm ngưỡng ({forProduct.length})
                  </button>
                )}
              </div>
              {!all && (
                <div className="check-grid">
                  {real.map((b) => {
                    const on = b.maCn in picked;
                    const s = forProduct.find((x) => x.maCn === b.maCn);
                    return (
                      <div key={b.maCn} className="row" style={{ gap: 6 }}>
                        <label className="row" style={{ gap: 6, flex: 1 }}>
                          <input type="checkbox" checked={on} onChange={() => setPicked((p) => {
                            const n = { ...p };
                            if (on) delete n[b.maCn]; else n[b.maCn] = s ? String(s.deXuat) : "";
                            return n;
                          })} />
                          <Dot on={b.online} />{b.maCn} <span className="muted">{b.ten}</span>
                          {s && <Badge tone={s.muc === "critical" ? "danger" : "warn"}>{s.soLuong}/{s.nguong}</Badge>}
                        </label>
                        {on && needProduct && (
                          <input type="number" min={1} style={{ width: 70, height: 26 }} placeholder="SL" value={picked[b.maCn]}
                            aria-label={`Số đề xuất cho ${b.maCn}`}
                            onChange={(e) => setPicked((p) => ({ ...p, [b.maCn]: e.target.value }))} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="row">
              <button className="btn btn-primary" disabled={!canSend}>Gửi thông báo tới {count} chi nhánh</button>
              <span className="note">Chi nhánh offline nhận khi đăng nhập lại.</span>
            </div>
          </form>
        </Card>

        <Card title={<>Chi nhánh sắp chạm ngưỡng <span className="muted">· {suggest.length}</span></>}>
          <p className="note" style={{ marginTop: 0 }}>Tồn &lt; 1,5 × ngưỡng và chưa có yêu cầu mở. Bấm “Hỏi” để soạn thông báo hỏi nhu cầu.</p>
          {suggest.length === 0 ? <Empty>Không có chi nhánh nào sắp chạm ngưỡng.</Empty> : (
            <div className="table-wrap scroll" style={{ maxHeight: 520 }}>
              <table>
                <thead>
                  <tr><th>Chi nhánh</th><th>Mặt hàng</th><th className="num">Tồn / ngưỡng</th><th className="num">Đề xuất</th><th /></tr>
                </thead>
                <tbody>
                  {suggest.map((s) => (
                    <tr key={s.maCn + s.maSp} className={s.muc === "critical" ? "low" : "warn"}>
                      <td className="nowrap"><b>{s.maCn}</b> <span className="muted">{s.tenCn}</span></td>
                      <td>{s.tenSp}</td>
                      <td className="num">{fmtNumber(s.soLuong)} / {fmtNumber(s.nguong)}</td>
                      <td className="num">{fmtNumber(s.deXuat)}</td>
                      <td className="right nowrap">
                        <button className="btn btn-sm" onClick={() => askFor(s.maSp, s.maCn)}>Hỏi</button>{" "}
                        <button className="btn btn-sm" onClick={() => askFor(s.maSp)}
                          title="Hỏi mọi chi nhánh sắp chạm ngưỡng mặt hàng này">Hỏi cả mặt hàng</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={<>Đã gửi <span className="muted">· {rows.length}</span></>}>
        {rows.length === 0 ? <Empty>Chưa gửi thông báo nào.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th><th>Loại</th><th>Tiêu đề</th><th className="num">Đã xem</th>
                  <th className="num">Đồng ý</th><th className="num">Từ chối</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <NoticeLine key={n.id} n={n} open={open === n.id} toggle={() => setOpen(open === n.id ? null : n.id)}
                    version={version + mine} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function NoticeLine({ n, open, toggle, version }: { n: NoticeRow; open: boolean; toggle: () => void; version: number }) {
  const [d, setD] = useState<NoticeDetail | null>(null);
  useEffect(() => {
    if (open) api<NoticeDetail>(`/api/notices/${n.id}`).then(setD).catch(() => {});
  }, [open, n.id, version]);

  return (
    <>
      <tr>
        <td className="muted nowrap">{n.taoLuc.slice(0, 16)}</td>
        <td><Badge tone={TYPE_TONE[n.loai]}>{NOTICE_TYPE_LABEL[n.loai]}</Badge></td>
        <td>
          <div className="with-thumb">
            {n.maSp && <ProductImage src={n.anhUrl} alt={n.tenSp ?? n.maSp} size={32} />}
            <div>
              {n.tieuDe}
              {n.noiDung && <div className="muted" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{n.noiDung.slice(0, 160)}</div>}
            </div>
          </div>
        </td>
        <td className="num nowrap">{n.daXem}/{n.tong}</td>
        <td className="num nowrap">
          {n.loai === "TIN" ? "—" : <>{n.dongY}{n.tongSoLuong > 0 && <span className="muted"> · {fmtNumber(n.tongSoLuong)} cái</span>}</>}
        </td>
        <td className="num">{n.loai === "TIN" ? "—" : n.tuChoi}</td>
        <td className="right"><button className="btn btn-sm" onClick={toggle}>{open ? "Ẩn" : "Chi tiết"}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-2)" }}>
            {!d ? <span className="muted">Đang tải...</span> : (
              <table>
                <thead>
                  <tr>
                    <th>Chi nhánh</th><th>Trạng thái</th><th className="num">Đề xuất</th><th className="num">CN xin</th>
                    <th>Yêu cầu</th><th>Xem lúc</th><th>Trả lời lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {d.chiNhanh.map((c) => (
                    <tr key={c.maCn}>
                      <td className="nowrap"><b>{c.maCn}</b> <span className="muted">{c.tenCn}</span></td>
                      <td><Badge tone={NOTICE_STATE_TONE[c.trangThai]}>{NOTICE_STATE_LABEL[c.trangThai]}</Badge></td>
                      <td className="num">{fmtNumber(c.deXuat)}</td>
                      <td className="num">{fmtNumber(c.soLuong)}</td>
                      <td className="nowrap">
                        {c.maYc ? <>YC{c.maYc} <span className="muted">{STATE_LABEL[c.ycTrangThai ?? ""] ?? c.ycTrangThai}</span></> : "—"}
                      </td>
                      <td className="muted nowrap">{c.xemLuc?.slice(0, 19) ?? "—"}</td>
                      <td className="muted nowrap">{c.traLoiLuc?.slice(0, 19) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
