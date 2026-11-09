"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

type NavItem<T extends string> = { id: T; label: string; count?: number; tone?: string; group?: string };
export type BackAction = { label: string; onClick: () => void };

const CatalogSearchContext = createContext<{ query: string; setQuery: (value: string) => void } | null>(null);
export function useCatalogSearch() {
  const context = useContext(CatalogSearchContext);
  if (!context) throw new Error("Catalog search requires a workspace.");
  return context;
}

export function BrandMark() {
  return <svg className="industry-brand-mark" width="42" height="42" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="20" fill="currentColor" />
    <path d="M20 5c0 10-5 15-15 15 10 0 15 5 15 15 0-10 5-15 15-15-10 0-15-5-15-15Z" fill="white" />
  </svg>;
}

export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement;
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="industry-side-panel" aria-labelledby={titleId} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="industry-panel-content"><header><h2 id={titleId}>{title}</h2><button type="button" className="btn industry-panel-close" aria-label="Đóng biểu mẫu" onClick={() => dialog.current?.close()}>×</button></header><div className="industry-panel-body">{children}</div></div>
  </dialog>;
}

/** Shared frame: functional groups above, context-specific views below. */
export function Shell<T extends string>({ sub, nav, value, onChange, status, title, actions, children, menu = false, navigationDisabled = false, back, menuLabel = "Chức năng chi nhánh", notificationId, className = "", description, catalogView, cartId }: {
  sub?: ReactNode; nav: NavItem<T>[]; value: T; onChange: (value: T) => void;
  status?: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode;
  menu?: boolean; navigationDisabled?: boolean; back?: BackAction; menuLabel?: string;
  notificationId?: T; className?: string; description?: string; catalogView?: T; cartId?: T;
}) {
  const dropdown = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => nav.find((item) => item.id === value)?.group ?? nav.find((item) => item.group)?.group ?? null);
  const [query, setQuery] = useState("");
  const notification = nav.find((item) => item.id === notificationId);
  const cart = nav.find((item) => item.id === cartId);
  const navigation = nav.filter((item) => item.id !== notificationId && item.id !== cartId);
  const groups = [...new Set(navigation.map((item) => item.group).filter((group): group is string => !!group))];
  const activeGroup = nav.find((item) => item.id === value)?.group ?? groups[0];
  const currentViews = navigation.filter((item) => !activeGroup || item.group === activeGroup);

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && !dropdown.current?.contains(target) && !target.closest("[data-functions-trigger]")) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); menuTrigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  useEffect(() => { if (navigationDisabled) setMenuOpen(false); }, [navigationDisabled]);

  const toggleMenu = (trigger: HTMLButtonElement) => { menuTrigger.current = trigger; setMenuOpen((open) => !open); };
  const select = (id: T) => { if (menuOpen) menuTrigger.current?.focus(); onChange(id); setMenuOpen(false); };
  const viewButton = (item: NavItem<T>) => <button type="button" key={item.id} className={value === item.id ? "active" : ""}
    aria-current={value === item.id ? "page" : undefined} disabled={navigationDisabled} onClick={() => select(item.id)}>
    <span>{item.label}</span>{!!item.count && <span className={`nav-count count-${item.tone ?? "muted"}`}>{item.count}</span>}
  </button>;

  return <CatalogSearchContext.Provider value={{ query, setQuery }}><div className={`workspace-shell industry-shell trade-shell ${className}`}>
    <div className="app-workspace">
      <header className="appbar appbar-compact industry-header">
        {menu && <button type="button" className="menu-toggle" data-functions-trigger aria-label="Tất cả chức năng" title="Tất cả chức năng" aria-expanded={menuOpen} aria-controls={menuId}
          disabled={navigationDisabled} onClick={(event) => toggleMenu(event.currentTarget)}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>}
        <div className="industry-brand"><b>TOBOKI</b></div>
        {catalogView && <div className="trade-searchbar">
          <form className="trade-search" role="search" onSubmit={(event) => { event.preventDefault(); if (!navigationDisabled) select(catalogView); }}>
            <svg className="store-search-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input type="search" aria-label="Tìm kiếm hàng hóa" placeholder="Bạn cần tìm sản phẩm, mã hàng hay model?" value={query} disabled={navigationDisabled} onChange={(event) => setQuery(event.target.value)} />
            <button type="submit" aria-label="Tìm sản phẩm" disabled={navigationDisabled}><span>Tìm kiếm</span><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
          </form>
          {cart && <button type="button" className={`header-cart${value === cart.id ? " active" : ""}`} aria-label={`Giỏ hàng (${cart.count ?? 0} sản phẩm)`} aria-current={value === cart.id ? "page" : undefined} disabled={navigationDisabled} onClick={() => select(cart.id)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h2l2.4 12h11l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>
            <span className="header-cart-label">Giỏ hàng</span><span className="header-cart-count">{cart.count ?? 0}</span>
          </button>}
        </div>}
        <div className="appbar-status">
          {notification && <button type="button" className={`header-notification${value === notification.id ? " active" : ""}`}
            aria-label={notification.count ? `Thông báo (${notification.count} chưa đọc)` : "Thông báo"} title="Thông báo"
            aria-current={value === notification.id ? "page" : undefined} disabled={navigationDisabled} onClick={() => select(notification.id)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2v1" /></svg>
            {!!notification.count && <span className="header-notification-count" aria-hidden="true">{notification.count > 99 ? "99+" : notification.count}</span>}
          </button>}
          {status}
        </div>
        {menu && <div ref={dropdown} id={menuId} className={`functions-dropdown${menuOpen ? " is-open" : ""}`} inert={!menuOpen}>
          <div className="functions-dropdown-clip"><nav className="functions-dropdown-content" aria-label="Tất cả chức năng">
            {groups.map((group, index) => {
              const expanded = expandedGroup === group;
              const groupId = `${menuId}-group-${index}`;
              return <div key={group} className={`functions-group${expanded ? " is-expanded" : ""}`}>
                <button type="button" className={`functions-group-toggle${activeGroup === group ? " is-current" : ""}`} aria-expanded={expanded} aria-controls={groupId} disabled={navigationDisabled} onClick={() => setExpandedGroup(expanded ? null : group)}>
                  <FunctionGroupIcon index={index} /><span>{group}</span><span className="functions-group-chevron"><MenuChevron /></span>
                </button>
                <div id={groupId} className="functions-group-panel" inert={!expanded}><div className="functions-group-clip"><div className="functions-group-links">{navigation.filter((item) => item.group === group).map(viewButton)}</div></div></div>
              </div>;
            })}
            {navigation.filter((item) => !item.group).map(viewButton)}
          </nav></div>
        </div>}
      </header>

      {menu && <nav className="industry-navigation" aria-label={menuLabel}>
        {groups.length > 0 && <div className="industry-sections" role="group" aria-label="Nhóm chức năng">{groups.map((group) => <button type="button" key={group}
          className={activeGroup === group ? "is-current" : ""} aria-current={activeGroup === group ? "true" : undefined} disabled={navigationDisabled}
          onClick={() => { const first = navigation.find((item) => item.group === group); if (first) select(first.id); }}>{group}</button>)}</div>}
        <div className="industry-view-links">{currentViews.map(viewButton)}</div><span className="industry-space-label">{sub}</span>
      </nav>}

      <div className="store-poster-layout">
        <aside className="store-side-poster store-side-poster-left" aria-label="Máy hút bụi công nghiệp TOBOKI">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/posters/toboki-vacuum.webp" width={400} height={1200} alt="" />
          <div className="store-poster-copy"><span>TOBOKI</span><h2>Máy hút bụi<br />công nghiệp</h2><i aria-hidden="true" /></div>
          <div className="store-poster-caption"><span>THIẾT BỊ & MÁY MÓC</span><p>Cho không gian<br />làm việc sạch.</p></div>
        </aside>
        <div className="store-workspace-content">
      <div className="subbar"><div className="page-heading"><div className="page-title-row">
        {back && <button type="button" className="btn btn-back" disabled={navigationDisabled} onClick={back.onClick}>← {back.label}</button>}<h1>{title}</h1>
      </div>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-header-actions">{actions}</div>}</div>
      <main className="page">{children}</main>
      <footer className="industry-workspace-footer"><span>TOBOKI · Hệ thống phân phối</span><span>{sub}</span></footer>
        </div>
        <aside className="store-side-poster store-side-poster-right" aria-label="Thiết bị nâng hạ TOBOKI">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/posters/toboki-hoist.webp" width={400} height={1200} alt="" />
          <div className="store-poster-copy"><span>TOBOKI</span><h2>Thiết bị<br />nâng hạ</h2><i aria-hidden="true" /></div>
          <div className="store-poster-caption"><span>MÁY TỜI · PA LĂNG</span><p>Đồng hành cùng<br />mọi công trình.</p></div>
        </aside>
      </div>
    </div>
  </div></CatalogSearchContext.Provider>;
}

function MenuChevron() {
  return <svg className="functions-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}

function FunctionGroupIcon({ index }: { index: number }) {
  const paths = ["M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z", "m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9", "M4 5h16v16H4ZM8 3v4M16 3v4M8 11h8M8 15h5"];
  return <svg className="functions-group-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={paths[index % paths.length]} /></svg>;
}
