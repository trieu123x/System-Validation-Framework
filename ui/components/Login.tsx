"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { PasswordRecovery, useRecoveryToken } from "@/components/PasswordRecovery";

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
        <div className="appbar-brand"><b>{COMPANY.brand}</b><span>Đăng nhập</span></div>
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
                  Mở trang đăng nhập {other.label.toLowerCase()} bằng đường dẫn riêng.
                </p>
                <a className="btn btn-primary btn-block" href={typeof window !== "undefined" && window.location.protocol === "https:"
                  ? `https://${host}${tab === "branch" ? ":8443" : ""}${other.path}`
                  : `http://${host}:${other.port}${other.path}`}>
                  Mở trang đăng nhập {other.label.toLowerCase()}
                </a>
                <span className="note">Nếu không mở được, vui lòng kiểm tra lại đường dẫn hoặc liên hệ quản trị viên.</span>
              </div>
            ) : children}
          </div>
        </section>
      </main>
      <CompanyFooter />
    </div>
  );
}

export function CompanyFooter() {
  return (
    <footer className="company-footer note">
      {COMPANY.name} · MST {COMPANY.mst} · {COMPANY.address} · Hotline {COMPANY.hotline}
    </footer>
  );
}

/** Đăng nhập Admin bằng username trong config hoặc email trong mail_admin_config. */
export function CompanyLogin({ onDone }: { onDone: (user: string) => void }) {
  const [method, setMethod] = useState<"username" | "email">("username");
  const [recoveryToken, setRecoveryToken] = useRecoveryToken();
  const [forgot, setForgot] = useState(false);
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

  if (forgot || recoveryToken) return <PasswordRecovery scope="admin" token={recoveryToken}
    onCancel={() => { setForgot(false); setRecoveryToken(""); }}
    onDone={() => { /* keep success message until the user returns to login */ }} />;

  return (
    <form className="form-stack" onSubmit={submit}>
      <label className="field">Hình thức đăng nhập
        <select value={method} onChange={(e) => {
          const next = e.target.value as "username" | "email";
          setMethod(next);
          setUser(next === "email" ? "" : "admin");
          setError("");
        }}>
          <option value="username">Tên đăng nhập Admin</option>
          <option value="email">Email Admin</option>
        </select>
      </label>
      <label className="field">{method === "email" ? "Email Admin" : "Tên đăng nhập Admin"}
        <input type={method === "email" ? "email" : "text"} value={user}
          onChange={(e) => setUser(e.target.value)} autoComplete="username"
          placeholder={method === "email" ? "VD: admin@example.com" : "VD: admin"} required autoFocus />
      </label>
      <label className="field">Mật khẩu
        <input type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)}
          autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      <button type="button" className="btn" onClick={() => setForgot(true)}>Quên mật khẩu?</button>
    </form>
  );
}
