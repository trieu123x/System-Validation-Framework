import branches from '../data/branches.json'
import Icon from './Icon'

export default function Branches() {
  return <section id="chi-nhanh" className="section branches-section" aria-labelledby="branches-title"><div className="page-width">
    <div className="section-heading"><div><p className="eyebrow">04 / CHI NHÁNH</p><h2 id="branches-title">Một hệ thống.<br />Nhiều điểm kết nối.</h2></div><p>15 chi nhánh được cấu hình trong dữ liệu demo. Tên và địa chỉ dưới đây phục vụ minh họa cho hệ thống của nhóm.</p></div>
    <ul className="branch-grid">{branches.map((branch, index) => <li key={branch.id} className="branch-card" data-branch-id={branch.id}><span className="branch-index">{(index + 1).toString().padStart(2, '0')}</span><div><h3>{branch.name}</h3><p><Icon name="pin" size={15} /><span>{branch.address}</span></p></div></li>)}</ul>
  </div></section>
}
