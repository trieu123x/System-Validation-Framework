"use client";

import { useState } from "react";
import { api, confirmCredit } from "@/lib/api";
import type { RequestRow } from "@/lib/types";
import { useAction } from "@/components/ui";

export function RequestShipment({ request, push, onShipped, label = "Xuất hàng" }: {
  request: Pick<RequestRow, "maYc" | "maCn" | "trangThai" | "soLuongChot" | "tonTong" | "giaXuat">;
  push: (level: string, text: string) => void; onShipped?: () => void; label?: string;
}) {
  const { run, busy } = useAction(push);
  const [confirming, setConfirming] = useState(false);
  const quantity = request.soLuongChot;
  if (!["DA_CHAP_NHAN", "THIEU_HANG"].includes(request.trangThai) || quantity == null) return null;
  const ship = async () => {
    if (busy || confirming || request.tonTong < quantity) return;
    setConfirming(true);
    try {
      if (await confirmCredit(request.maCn, quantity * request.giaXuat)) {
        if (await run(() => api(`/api/requests/${request.maYc}/ship`, { soLuong: quantity }), `Đã xuất hàng YC${request.maYc}`)) onShipped?.();
      }
    } finally { setConfirming(false); }
  };
  return <button type="button" className="btn btn-sm" disabled={busy || confirming || request.tonTong < quantity}
    title={request.tonTong < quantity ? `Kho tổng còn ${request.tonTong}, cần ${quantity}` : `Xuất đúng ${quantity} sản phẩm chi nhánh đã chấp nhận`}
    onClick={() => void ship()}>{label}</button>;
}
