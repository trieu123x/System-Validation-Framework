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

/** Shared frame with grouped dropdown navigation. */
export function Shell<T extends string>({ sub, nav, value, onChange, status, navigationStatus, title, actions, children, menu = false, navigationDisabled = false, back, menuLabel = "Chức năng chi nhánh", notificationId, className = "", description, catalogView, cartId }: {
  sub?: ReactNode; nav: NavItem<T>[]; value: T; onChange: (value: T) => void;
  status?: ReactNode; navigationStatus?: ReactNode; title: ReactNode; actions?: ReactNode; children: ReactNode;
  menu?: boolean; navigationDisabled?: boolean; back?: BackAction; menuLabel?: string;
  notificationId?: T; className?: string; description?: string; catalogView?: T; cartId?: T;
}) {
  const header = useRef<HTMLElement>(null);
  const navigationBar = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const menuOpen = openGroup !== null;
  const [query, setQuery] = useState("");
  const notification = nav.find((item) => item.id === notificationId);
  const cart = nav.find((item) => item.id === cartId);
  const navigation = nav.filter((item) => item.id !== notificationId && item.id !== cartId);
  const groups = [...new Set(navigation.map((item) => item.group).filter((group): group is string => !!group))];
  const activeGroup = nav.find((item) => item.id === value)?.group ?? groups[0];

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const root = document.documentElement;
    const property = "--workspace-toolbar-height";
    const previous = root.style.getPropertyValue(property);
    const measure = () => root.style.setProperty(property, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (previous) root.style.setProperty(property, previous);
      else root.style.removeProperty(property);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && !navigationBar.current?.contains(target)) setOpenGroup(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpenGroup(null); menuTrigger.current?.focus(); }
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
  useEffect(() => { if (navigationDisabled) setOpenGroup(null); }, [navigationDisabled]);

  const toggleMenu = (group: string, trigger: HTMLButtonElement) => { menuTrigger.current = trigger; setOpenGroup((open) => open === group ? null : group); };
  const select = (id: T) => { if (menuOpen) menuTrigger.current?.focus(); onChange(id); setOpenGroup(null); };
  const viewButton = (item: NavItem<T>) => <button type="button" key={item.id} className={value === item.id ? "active" : ""}
    aria-current={value === item.id ? "page" : undefined} disabled={navigationDisabled} onClick={() => select(item.id)}>
    <span>{item.label}</span>{!!item.count && <span className={`nav-count count-${item.tone ?? "muted"}`}>{item.count}</span>}
  </button>;

  return <CatalogSearchContext.Provider value={{ query, setQuery }}><div className={`workspace-shell industry-shell trade-shell ${className}`}>
    <div className="app-workspace">
      <header ref={header} className="appbar appbar-compact industry-header">
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
      </header>

      {menu && <nav ref={navigationBar} className="industry-navigation" aria-label={menuLabel}>
        {groups.length > 0 && <div className="industry-sections" role="group" aria-label="Nhóm chức năng">{groups.map((group, index) => {
          const expanded = openGroup === group;
          const groupId = `${menuId}-group-${index}`;
          return <div key={group} className="industry-section">
            <button type="button" className={`industry-section-toggle${activeGroup === group ? " is-current" : ""}`} aria-current={activeGroup === group ? "true" : undefined}
              aria-expanded={expanded} aria-controls={groupId} disabled={navigationDisabled} onClick={(event) => toggleMenu(group, event.currentTarget)}>
              <span>{group}</span><MenuChevron />
            </button>
            <div id={groupId} className={`functions-dropdown${expanded ? " is-open" : ""}`} inert={!expanded}>
              <div className="functions-dropdown-clip"><div className="functions-dropdown-content" role="group" aria-label={group}>
                <div className="functions-group-links">{navigation.filter((item) => item.group === group).map(viewButton)}</div>
              </div></div>
            </div>
          </div>;
        })}</div>}
        <div className="industry-workspace-status"><span className="industry-space-label">{sub}</span>{navigationStatus}</div>
      </nav>}

      <div className="store-poster-layout">
        <div className="store-workspace-content">
      <div className="subbar"><div className="page-heading"><div className="page-title-row">
        {back && <button type="button" className="btn btn-back" disabled={navigationDisabled} onClick={back.onClick}>← {back.label}</button>}<h1>{title}</h1>
      </div>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-header-actions">{actions}</div>}</div>
      <main className="page">{children}</main>
      <footer className="industry-workspace-footer"><span>TOBOKI · Hệ thống phân phối</span><span>{sub}</span></footer>
        </div>
      </div>
    </div>
  </div></CatalogSearchContext.Provider>;
}

function MenuChevron() {
  return <svg className="functions-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
}
