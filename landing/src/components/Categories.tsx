import { categories, products } from '../lib/catalog'
import ProductImage from './ProductImage'
import Icon from './Icon'

export default function Categories({ onSelect }: { onSelect: (id: string, scroll?: boolean) => void }) {
  return <section id="danh-muc" className="section category-section" aria-labelledby="categories-title">
    <div className="page-width">
      <div className="section-heading"><div><p className="eyebrow">01 / DANH MỤC</p><h2 id="categories-title">Đúng thiết bị.<br />Đúng nhu cầu.</h2></div><p>Bảy danh mục chủ lực, từ vệ sinh công nghiệp đến thiết bị thi công và phụ kiện.</p></div>
      <div className="category-grid">
        {categories.filter((category) => category.primary).map((category) => {
          const product = products.find((item) => item.id === category.representativeProductId)!
          const count = products.filter((item) => item.categoryId === category.id).length
          return <button type="button" key={category.id} className="category-card" onClick={() => onSelect(category.id, true)}>
            <div className="category-image" aria-hidden="true"><ProductImage product={product} sizes="(max-width: 600px) 40vw, 170px" /></div>
            <span className="category-caption"><strong>{category.name}</strong><small>{count} sản phẩm</small></span><Icon name="arrow" size={17} />
          </button>
        })}
      </div>
      <div className="new-categories"><span>Thêm 3 nhóm hàng mới</span><div>{categories.filter((category) => !category.primary).map((category) => <button key={category.id} type="button" onClick={() => onSelect(category.id, true)}>{category.name} <span aria-hidden="true">↗</span></button>)}</div></div>
    </div>
  </section>
}
