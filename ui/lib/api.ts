"use client";

import { useEffect, useRef, useState } from "react";

export const UNAUTHORIZED = "pp-unauthorized";

/** Gọi HTTP API cục bộ của Java (server :8080 hoặc client :8081). Lỗi → Error với thông báo từ server. */
export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // phiên công ty hết hạn (vd. server.jar khởi động lại): trang admin quay về màn đăng nhập
    if (res.status === 401 && !path.startsWith("/api/auth/") && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED));
    }
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

/** Đăng ký Server-Sent Events /api/events. Trả về trạng thái kết nối tới tiến trình Java. */
export function useEvents(handlers: Record<string, (data: any) => void>): boolean {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(false);
  const names = Object.keys(handlers).sort().join(",");

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    for (const name of names.split(",")) {
      es.addEventListener(name, (ev) => {
        setConnected(true);
        try {
          ref.current[name]?.(JSON.parse((ev as MessageEvent).data));
        } catch {
          // bỏ qua sự kiện hỏng
        }
      });
    }
    return () => es.close();
  }, [names]);

  return connected;
}

/** Gọi fn nhiều lần liên tiếp thì chỉ chạy một lần sau `ms` (tránh tải lại dồn dập khi giả lập tải). */
export function useDebounced(fn: () => void, ms: number): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, ms);
  };
}

/** Trạng thái yêu cầu cấp hàng: DA_GIAO = công ty đã gửi hàng, HOAN_TAT = chi nhánh đã bấm nhận. */
export const STATE_LABEL: Record<string, string> = {
  CHO: "Chờ xử lý",
  DA_DE_XUAT: "Chờ xác nhận",
  THIEU_HANG: "Không đủ hàng",
  DA_GIAO: "Đã gửi",
  HOAN_TAT: "Đã nhận",
  TU_CHOI: "Từ chối",
  HUY: "Đã huỷ",
  DANG_CHUYEN: "Đang chuyển",
};

/** Trạng thái phiếu điều chuyển giữa chi nhánh. */
export const TRANSFER_LABEL: Record<string, string> = {
  CHO: "Chờ đồng ý",
  DANG_CHUYEN: "Đang chuyển",
  HOAN_TAT: "Đã chuyển",
  TU_CHOI: "Từ chối",
  HUY: "Đã huỷ",
};

export const STATE_TONE: Record<string, string> = {
  CHO: "warn",
  DA_DE_XUAT: "info",
  THIEU_HANG: "danger",
  DA_GIAO: "accent",
  HOAN_TAT: "success",
  TU_CHOI: "muted",
  HUY: "muted",
  DANG_CHUYEN: "info",
};

export function fmtNumber(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("vi-VN");
}

export function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
