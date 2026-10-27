import company from '../data/company.json'
import credits from '../data/image-credits.json'
import { licenseUrl, systemLinks } from '../lib/catalog'
import Icon from './Icon'

export default function Footer() {
  const phone = company.hotline.replace(/[^\d+]/g, '')
  return <footer id="lien-he" className="site-footer">
    <div className="page-width">
      <div className="contact-heading"><div><p className="eyebrow">05 / LIÊN HỆ</p><h2>Cùng kết nối<br />hệ thống phân phối.</h2></div>{systemLinks.admin && <a href={systemLinks.admin} className="button button-orange">Đăng nhập quản trị <Icon name="arrow" /></a>}</div>
      <div className="footer-columns">
        <div><a className="wordmark footer-wordmark" href="#main">TOBOKI<span>.</span></a><p className="footer-company">{company.name}</p><address>{company.address}</address><p className="footer-tax">MST: {company.mst}</p></div>
        <div><h3>Thông tin liên hệ</h3><a className="footer-phone" href={`tel:${phone}`}><Icon name="phone" size={19} />{company.hotline}</a><p>Thông tin liên hệ cần được xác nhận trước khi sử dụng.<br />Trang không tiếp nhận đơn đặt hàng.</p></div>
        <div><h3>Truy cập nhanh</h3><nav aria-label="Liên kết cuối trang"><a href="#san-pham">Sản phẩm</a><a href="#danh-muc">Danh mục thiết bị</a><a href="#chi-nhanh">Hệ thống chi nhánh</a>{systemLinks.branch && <a href={systemLinks.branch}>Đăng nhập chi nhánh ↗</a>}</nav></div>
      </div>
      <details id="ghi-cong-anh" className="image-credits">
        <summary>Ghi công ảnh · Wikimedia Commons <span>Ảnh minh họa, không đại diện chính xác cho model TOBOKI</span></summary>
        <p className="credits-intro">Ảnh từ Wikimedia Commons được chuyển sang WebP và thu nhỏ để hiển thị. Tên tác giả, nguồn gốc và giấy phép được giữ theo hồ sơ từng hình ảnh.</p>
        <ul>{credits.map((credit) => <li key={credit.source}><span className="credit-products">{credit.products.map((product) => product.id).join(', ')}</span><div><a href={credit.source} target="_blank" rel="noreferrer">{credit.title.replace(/^File:/, '')} ↗</a><p>{credit.artist} · <a href={licenseUrl(credit.license) ?? credit.source} target="_blank" rel="noreferrer">{credit.license}</a></p></div></li>)}</ul>
      </details>
      <div className="footer-bottom"><p>TOBOKI · Thiết bị và chi nhánh.</p><a href="#main">Về đầu trang ↑</a></div>
    </div>
  </footer>
}
