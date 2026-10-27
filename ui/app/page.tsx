"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Cùng một bản build phục vụ cả server (admin) và client (chi nhánh): hỏi tiến trình Java mình là ai. */
export default function Home() {
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ role: string }>("/api/role")
      .then((r) => window.location.replace(r.role === "admin" ? "/admin/" : "/branch/"))
      .catch(() => setError("Không thể kết nối đến dịch vụ. Vui lòng thử lại sau."));
  }, []);

  return (
    <main className="center">
      <p className="muted">{error || "Đang mở..."}</p>
    </main>
  );
}
