"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Side = "company" | "branch";

const SIDES: Record<Side, { label: string; app: string; port: number; path: string }> = {
  company: { label: "Công ty", app: "server.jar", port: 8080, path: "/admin/" },
  branch: { label: "Chi nhánh", app: "client.jar", port: 8081, path: "/branch/" },
};

/**
 * Trang đăng nhập chung. Mỗi tiến trình Java chỉ phục vụ một phía (server.jar: công ty, client.jar: chi nhánh),
 * nên thẻ của phía còn lại chỉ dẫn sang ứng dụng tương ứng trên máy này.
 */
export function LoginScreen({ side, children }: { side: Side; children: ReactNode }) {
  const [tab, setTab] = useState<Side>(side);
  const [host, setHost] = useState("127.0.0.1");
  useEffect(() => setHost(window.location.hostname), []);
  const other = tab !== side ? SIDES[tab] : null;

  return (
    <div className="login-page">
      <header className="appbar">
        <div className="appbar-brand"><b>Phân phối hàng hóa</b><span>Đăng nhập hệ thống</span></div>
      </header>
      <main className="center">
        <section className="card login">
          <div className="login-tabs" role="tablist">
            {(Object.keys(SIDES) as Side[]).map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? "active" : ""}
                onClick={() => setTab(s)}>
                {SIDES[s].label}
              </button>
            ))}
          </div>
          <div className="card-body">
            {other ? (
              <div className="form-stack">
                <p style={{ margin: 0 }}>
                  Trang {other.label.toLowerCase()} do <b>{other.app}</b> phục vụ ở cổng {other.port}.
                </p>
                <a className="btn btn-primary btn-block" href={`http://${host}:${other.port}${other.path}`}>
                  Mở trang đăng nhập {other.label.toLowerCase()}
                </a>
                <span className="note">Nếu không mở được, hãy chạy {other.app} trên máy này trước.</span>
              </div>
            ) : children}
          </div>
        </section>
      </main>
    </div>
  );
}

/** Form đăng nhập công ty: tài khoản quản trị trong config/server.properties. */
export function CompanyLogin({ onDone }: { onDone: (user: string) => void }) {
  const [user, setUser] = useState("admin");
  const [matKhau, setMatKhau] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: string }>("/api/auth/login", { user: user.trim(), matKhau });
      onDone(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <label className="field">Tên đăng nhập
        <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
      </label>
      <label className="field">Mật khẩu
        <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)} autoFocus
          autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
    </form>
  );
}
