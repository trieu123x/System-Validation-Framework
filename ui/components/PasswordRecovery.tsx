"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

/** The token only travels in the URL fragment, not server logs or HTTP referrers. */
export function useRecoveryToken() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const fragment = window.location.hash;
    const match = /^#reset=([A-Za-z0-9_-]{43})$/.exec(fragment);
    if (match) {
      setToken(match[1]);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  return [token, setToken] as const;
}

export function PasswordRecovery({
  scope, token, onCancel, onDone,
}: {
  scope: "admin" | "branch";
  token: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [branchHint, setBranchHint] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isReset = Boolean(token);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setMessage("");
    if (isReset && password !== confirmPassword) {
      setError("Hai mật khẩu không trùng nhau.");
      return;
    }
    setBusy(true);
    try {
      if (isReset) {
        if (password.length < 12) throw new Error("Mật khẩu phải có ít nhất 12 ký tự.");
        await api(scope === "admin" ? "/api/auth/recovery/confirm" : "/api/password/reset",
          scope === "admin" ? { scope, token, password } : { token, password });
        setMessage("Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.");
        setPassword(""); setConfirmPassword("");
        onDone();
      } else {
        await api(scope === "admin" ? "/api/auth/recovery/request" : "/api/password/forgot",
          scope === "admin" ? { scope, email: email.trim() } : { email: email.trim(), branchHint: branchHint.trim() });
        setMessage("Nếu email khớp tài khoản và SMTP đã bật, bạn sẽ nhận được liên kết đặt lại mật khẩu. Vui lòng kiểm tra cả Spam.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <h2 style={{ margin: 0 }}>{isReset ? "Đặt lại mật khẩu" : "Quên mật khẩu"}</h2>
      {isReset ? <>
        <p className="note">Liên kết chỉ có hiệu lực 15 phút và chỉ sử dụng một lần.</p>
        <label className="field">Mật khẩu mới (ít nhất 12 ký tự)
          <input type="password" minLength={12} maxLength={128} autoComplete="new-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">Nhập lại mật khẩu mới
          <input type="password" minLength={12} maxLength={128} autoComplete="new-password" required
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
      </> : <>
        <p className="note">Nhập email đã lưu trong hệ thống. Liên kết đặt lại mật khẩu sẽ gửi qua SMTP.</p>
        <label className="field">Email {scope === "admin" ? "Admin" : "chi nhánh"}
          <input type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </label>
        {scope === "branch" && <label className="field">Mã chi nhánh (bắt buộc khi dùng chung email)
          <input value={branchHint} maxLength={32} placeholder="VD: CN01 hoặc CN02"
            onChange={(e) => setBranchHint(e.target.value)} />
        </label>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="note" role="status">{message}</p>}
      {!isReset || !message ? <button className="btn btn-primary" disabled={busy}>
        {busy ? "Đang xử lý..." : isReset ? "Đổi mật khẩu" : "Gửi liên kết đặt lại"}
      </button> : null}
      <button className="btn" type="button" onClick={onCancel}>Quay lại đăng nhập</button>
    </form>
  );
}
