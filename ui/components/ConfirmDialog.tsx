"use client";

import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./confirm-dialog.css";

export function ConfirmDialog({ title, children, confirmLabel, tone = "success", disabled = false, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; tone?: "success" | "danger"; disabled?: boolean;
  onConfirm: () => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (element && !element.open) element.showModal();
    cancel.current?.focus();
    return () => {
      if (element?.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    dialog.current?.focus();
    try {
      await onConfirm();
      onClose();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) {
      event.preventDefault();
      event.currentTarget.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(<dialog className="workflow-confirm-dialog" ref={dialog} tabIndex={-1} onKeyDown={trapFocus} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!inFlight.current) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !inFlight.current) onClose(); }}>
    <form onSubmit={(event) => void submit(event)} aria-busy={submitting}>
      <header className="workflow-confirm-heading"><h2 id={titleId}>{title}</h2></header>
      <div className="workflow-confirm-description" id={descriptionId}>{children}</div>
      <footer className="workflow-confirm-actions">
        <button ref={cancel} type="button" className="btn" disabled={submitting} onClick={onClose}>Quay lại</button>
        <button type="submit" className={`btn btn-${tone}`} disabled={disabled || submitting}>{submitting ? "Đang xử lý…" : confirmLabel}</button>
      </footer>
    </form>
  </dialog>, document.querySelector(".workspace-shell") ?? document.body);
}
