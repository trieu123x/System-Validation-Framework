"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Entry<T extends string> = { scope: string; session: string; view: T; index: number };
const KEY = "tobokiNavigation";
const sessionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Keep internal views in browser history without changing routes or authentication. */
export function useWorkspaceNavigation<T extends string>({ scope, initial, views, enabled = true, blocked = false }: {
  scope: string; initial: T; views: readonly T[]; enabled?: boolean; blocked?: boolean;
}) {
  const [view, setView] = useState<T>(initial);
  const current = useRef<Entry<T> | null>(null);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  const read = useCallback((state: unknown): Entry<T> | null => {
    const candidate = (state as Record<string, Entry<T>> | null)?.[KEY];
    return candidate?.scope === scope && typeof candidate.session === "string"
      && views.includes(candidate.view) && Number.isSafeInteger(candidate.index) && candidate.index >= 0 ? candidate : null;
  }, [scope, views]);

  const fromUrl = useCallback((): T | null => {
    const requested = new URLSearchParams(window.location.hash.slice(1)).get("view");
    return requested && views.includes(requested as T) ? requested as T : null;
  }, [views]);

  const write = useCallback((entry: Entry<T>, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    url.hash = entry.view === initial ? "" : `view=${encodeURIComponent(entry.view)}`;
    // Preserve Next.js metadata so native Back/Forward does not trigger a full reload.
    const state = { ...window.history.state, [KEY]: entry };
    if (mode === "push") window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
    current.current = entry;
    setView(entry.view);
  }, [initial]);

  useEffect(() => {
    if (!enabled) { current.current = null; setView(initial); return; }
    // Password recovery owns its fragment and must never be consumed by workspace navigation.
    if (window.location.hash.startsWith("#reset=")) return;
    const existing = read(window.history.state);
    const target = fromUrl() ?? existing?.view ?? initial;
    const first = existing?.view === target ? existing : { scope, session: sessionId(), view: target, index: 0 };
    write(first, "replace");

    const pop = (event: PopStateEvent) => {
      const incoming = read(event.state);
      const target = fromUrl() ?? incoming?.view ?? initial;
      const previous = current.current;
      if (blockedRef.current && previous && previous.view !== target) {
        // Keep a payment in flight on screen; the guard ends as soon as the request finishes.
        if (incoming?.session === previous.session && incoming.index !== previous.index) {
          window.history.go(previous.index - incoming.index);
        } else {
          write({ ...previous, session: sessionId(), index: 0 }, "replace");
        }
        return;
      }
      const entry = incoming?.view === target ? incoming : { scope, session: sessionId(), view: target, index: 0 };
      if (entry !== incoming) write(entry, "replace");
      else { current.current = entry; setView(target); }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [enabled, scope, initial, read, fromUrl, write]);

  const navigate = useCallback((next: T) => {
    if (!enabled || blockedRef.current || !views.includes(next) || window.location.hash.startsWith("#reset=")) return;
    const entry = current.current;
    if (!entry || entry.view === next) return;
    write({ ...entry, view: next, index: entry.index + 1 }, "push");
  }, [enabled, views, write]);

  const goBack = useCallback(() => {
    if (!enabled || blockedRef.current) return;
    const entry = current.current;
    if (!entry) return;
    if (entry.index > 0) window.history.back();
    else if (entry.view !== initial) write({ ...entry, view: initial }, "replace");
  }, [enabled, initial, write]);

  return { view, navigate, goBack };
}
