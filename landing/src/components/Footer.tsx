import { useEffect, useRef, useState } from 'react'
import company from '../data/company.json'
import { systemLinks } from '../lib/catalog'
import Icon from './Icon'

export default function Footer() {
  const pageEnd = useRef<HTMLDivElement>(null)
  const [atPageEnd, setAtPageEnd] = useState(false)

  useEffect(() => {
    const target = pageEnd.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => {
      setAtPageEnd(entry.isIntersecting && window.scrollY > 0)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  function scrollToTop() {
    document.getElementById('main')?.focus({ preventScroll: true })
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  const phone = company.hotline.replace(/[^\d+]/g, '')
  return <footer id="lien-he" className="site-footer">
    <div className="page-width">
      <div className="contact-heading"><div><p className="eyebrow">04 / LIÊN HỆ</p><h2>Liên hệ<br />TOBOKI.</h2></div>{systemLinks.admin && <a href={systemLinks.admin} className="button button-orange">Đăng nhập hệ thống <Icon name="arrow" /></a>}</div>
      <div className="footer-columns">
        <div><a className="wordmark footer-wordmark" href="#main">TOBOKI<span>.</span></a><p className="footer-company">{company.name}</p><address>{company.address}</address><p className="footer-tax">MST: {company.mst}</p></div>
        <div><h3>Thông tin liên hệ</h3><a className="footer-phone" href={`tel:${phone}`}><Icon name="phone" size={19} />{company.hotline}</a></div>
        <div><h3>Truy cập nhanh</h3><nav aria-label="Liên kết cuối trang"><a href="#san-pham">Sản phẩm</a><a href="#danh-muc">Danh mục thiết bị</a><a href="#chi-nhanh">Hệ thống chi nhánh</a>{systemLinks.branch && <a href={systemLinks.branch}>Đăng nhập chi nhánh ↗</a>}</nav></div>
      </div>
      <div className="footer-bottom"><p>TOBOKI · Máy móc và thiết bị</p></div>
    </div>
    <div ref={pageEnd} className="page-end-marker" aria-hidden="true" />
    {atPageEnd && <button type="button" className="back-to-top" aria-label="Về đầu trang" title="Về đầu trang" onClick={scrollToTop}><Icon name="arrow" size={24} /></button>}
  </footer>
}
