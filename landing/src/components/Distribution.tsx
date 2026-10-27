import branches from '../data/branches.json'
import { categories, products, systemLinks } from '../lib/catalog'
import Icon from './Icon'

const steps = [
  { number: '01', icon: 'signal' as const, title: 'Chi nhánh báo thiếu', text: 'Tồn kho xuống dưới ngưỡng, chi nhánh gửi cảnh báo tới công ty.' },
  { number: '02', icon: 'truck' as const, title: 'Công ty điều phối', text: 'Công ty xem nhu cầu, đề xuất và gửi hàng cho chi nhánh.' },
  { number: '03', icon: 'check' as const, title: 'Xác nhận đã nhận', text: 'Chi nhánh xác nhận nhận hàng, hệ thống cập nhật tồn kho.' },
]

export default function Distribution() {
  return <section id="he-thong" className="distribution-section" aria-labelledby="distribution-title"><div className="page-width">
    <div className="distribution-top"><div><p className="eyebrow">03 / HỆ THỐNG PHÂN PHỐI</p><h2 id="distribution-title">Kết nối chi nhánh.<br /><span>Thông suốt hàng hóa.</span></h2></div><p>Theo dõi hàng hóa và kết nối các chi nhánh nhanh chóng, thuận tiện.</p></div>
    <div className="system-stats" aria-label="Thông tin chi nhánh và danh mục">
      <div><strong>{branches.length.toString().padStart(2, '0')}<span>↗</span></strong><span>Chi nhánh</span></div>
      <div><strong>{products.length}</strong><span>Mặt hàng trong danh mục</span></div>
      <div><strong>{categories.filter((category) => category.primary).length.toString().padStart(2, '0')}<small> + 3</small></strong><span>Danh mục chủ lực + nhóm mới</span></div>
    </div>
    <ol className="distribution-flow">{steps.map((step) => <li key={step.number}><div className="flow-marker"><span>{step.number}</span><Icon name={step.icon} size={25} /></div><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
    {systemLinks.branch && <a className="text-link distribution-link" href={systemLinks.branch}>Truy cập trang chi nhánh <Icon name="arrow" size={18} /></a>}
  </div></section>
}
