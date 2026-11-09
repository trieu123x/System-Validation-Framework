"use client";

import { FormEvent, ReactNode, useEffect, useState, type InputHTMLAttributes } from "react";
import localFont from "next/font/local";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { PasswordRecovery, useRecoveryToken } from "@/components/PasswordRecovery";
import { BrandMark } from "@/components/WorkspaceShell";
import "./login.css";

const loginFont = localFont({ src: "../fonts/Manrope-Variable.ttf", variable: "--font-login", weight: "200 800", display: "swap", preload: false });

type Side = "company" | "branch";

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
    <main className={`login-page login-split ${loginFont.variable}`}>
      <section className="login-form-panel" aria-label="Đăng nhập TOBOKI">
        <header className="login-brand"><BrandMark /><span>{COMPANY.brand}</span></header>
        <div className="login-form-content">
        <div className="login-form-heading"><h1>Chào mừng trở lại!</h1><p>Đăng nhập để tiếp tục công việc và quản lý<br className="login-desktop-break" /> hệ thống phân phối của bạn.</p></div>
        <section className="login">
          <div className="login-tabs" role="tablist" aria-label="Chọn không gian làm việc">
            {(Object.keys(SIDES) as Side[]).map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? "active" : ""}
                onClick={() => setTab(s)}>
                {SIDES[s].label}
              </button>
            ))}
          </div>
          <div className="login-form-body">
            {other ? (
              <div className="form-stack">
                <a className="btn btn-primary btn-block" onClick={(event) => {
                  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  window.location.replace(event.currentTarget.href);
                }} href={typeof window !== "undefined" && window.location.protocol === "https:"
                  ? `https://${host}${tab === "branch" ? ":8443" : ""}${other.path}`
                  : `http://${host}:${other.port}${other.path}`}>
                  Mở trang đăng nhập {other.label.toLowerCase()}
                </a>
              </div>
            ) : children}
          </div>
        </section>
        <div className="login-support"><span>HỆ THỐNG PHÂN PHỐI TOBOKI</span><p>Cần hỗ trợ đăng nhập? <span>Liên hệ quản trị viên của bạn.</span></p></div>
        </div>
        <CompanyFooter />
      </section>
      <aside className="login-story-panel" aria-label="Giới thiệu hệ thống">
        <div className="login-story-content">
          <h2>Quản lý phân phối.<br /><span>Kết nối mọi chi nhánh.</span></h2>
          <p className="login-story-description">Từ kho tổng đến từng chi nhánh, theo dõi hàng hóa, điều phối cấp hàng và cập nhật trạng thái trong cùng một hệ thống.</p>
          <div className="login-story-role"><span className="login-role-avatar">{side === "company" ? "CT" : "CN"}</span><div><strong>{side === "company" ? "Quản trị công ty" : "Vận hành chi nhánh"}</strong><span>{side === "company" ? "Theo dõi toàn hệ thống, chủ động điều phối." : "Bán hàng thuận tiện, quản lý tồn kho rõ ràng."}</span></div></div>
        </div>
        <div className="login-capabilities"><div className="login-capabilities-heading"><span>CÙNG MỘT HỆ THỐNG</span><i /></div><div className="login-capabilities-grid">
          <span><LoginIcon name="box" />Hàng hóa & tồn kho</span><span><LoginIcon name="transfer" />Điều phối cấp hàng</span>
          <span><LoginIcon name="receipt" />Bán hàng & hóa đơn</span><span><LoginIcon name="ledger" />Công nợ & đối soát</span>
        </div></div>
      </aside>
    </main>
  );
}

function LoginIcon({ name }: { name: "user" | "mail" | "lock" | "eye" | "eye-off" | "box" | "transfer" | "receipt" | "ledger" }) {
  const paths = {
    user: "M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    mail: "M3 5h18v14H3Zm0 1 9 7 9-7",
    lock: "M5 10h14v11H5Zm3 0V7a4 4 0 0 1 8 0v3M12 14v3",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    "eye-off": "m3 3 18 18M10.6 5.1 12 5c6 0 10 7 10 7s-1.4 2.4-3.8 4.4M6.2 6.2C3.6 8.4 2 12 2 12s4 7 10 7c1.8 0 3.4-.6 4.8-1.4M10 10a3 3 0 0 0 4 4",
    box: "m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5",
    transfer: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3",
    ledger: "M3 5h18v15H3ZM3 9h18M7 13h4M7 16h4m4-3 2 2 3-4",
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function LoginInput({ icon, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: "user" | "mail" | "lock" }) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  return <span className={`login-input${password ? " login-input-password" : ""}`}>
    <span className="login-input-icon"><LoginIcon name={icon} /></span>
    <input {...props} type={password && visible ? "text" : type} />
    {password && <button type="button" className="login-password-toggle" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible} onClick={() => setVisible((current) => !current)}><LoginIcon name={visible ? "eye" : "eye-off"} /></button>}
  </span>;
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
    <form className="form-stack login-credentials" onSubmit={submit}>
      <label className="field login-method-field">Hình thức đăng nhập
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
        <LoginInput icon={method === "email" ? "mail" : "user"} type={method === "email" ? "email" : "text"} value={user}
          onChange={(e) => setUser(e.target.value)} autoComplete="username"
          placeholder={method === "email" ? "VD: admin@example.com" : "VD: admin"} required autoFocus />
      </label>
      <label className="field">Mật khẩu
        <LoginInput icon="lock" type="password" value={matKhau} onChange={(e) => setMatKhau(e.target.value)}
          autoComplete="current-password" placeholder="Nhập mật khẩu của bạn" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="login-forgot" disabled={busy} onClick={() => setForgot(true)}>Quên mật khẩu?</button>
      <button className="btn btn-primary login-submit" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
    </form>
  );
}
