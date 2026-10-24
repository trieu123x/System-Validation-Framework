import { useRef, useState } from 'react'
import company from '../data/company.json'
import { systemLinks } from '../lib/catalog'
import Icon from './Icon'

const navigation = [
  { href: '#san-pham', label: 'Sản phẩm' },
  { href: '#danh-muc', label: 'Danh mục' },
  { href: '#chi-nhanh', label: 'Chi nhánh' },
  { href: '#lien-he', label: 'Liên hệ' },
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  return (
    <>
      <div className="announcement"><div className="page-width"><span>THIẾT BỊ & GIẢI PHÁP PHÂN PHỐI</span><span className="announcement-note">Bản demo · Lập trình mạng</span></div></div>
      <header className="site-header" onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false)
          menuButton.current?.focus()
        }
      }}>
        <div className="page-width header-inner">
          <a href="#main" className="wordmark" onClick={() => setOpen(false)}>{company.brand}<span>.</span><small>MÁY MÓC & THIẾT BỊ</small></a>
          <button ref={menuButton} className="menu-toggle" type="button" aria-label={open ? 'Đóng menu' : 'Mở menu'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /><span>Menu</span></button>
          <nav id="main-navigation" aria-label="Điều hướng chính" className={`main-navigation ${open ? 'is-open' : ''}`}>
            {navigation.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
            {systemLinks.admin && <a className="button button-dark nav-login" href={systemLinks.admin}>Đăng nhập hệ thống <Icon name="arrow" size={16} /></a>}
          </nav>
        </div>
      </header>
    </>
  )
}
