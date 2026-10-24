import { useState } from 'react'
import { categories, products, featuredProducts } from '../lib/catalog'
import ProductCard from './ProductCard'
import Icon from './Icon'

export default function ProductCatalog({ selectedCategory, onSelect }: { selectedCategory: string; onSelect: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false)
  const visible = selectedCategory !== 'all' ? products.filter((product) => product.categoryId === selectedCategory) : showAll ? products : featuredProducts

  function select(id: string) {
    setShowAll(false)
    onSelect(id)
  }

  return <section id="san-pham" className="section products-section" aria-labelledby="products-title">
    <div className="page-width">
      <div className="section-heading"><div><p className="eyebrow">02 / SẢN PHẨM</p><h2 id="products-title" tabIndex={-1}>Thiết bị nổi bật.</h2></div><p>Khám phá 12 lựa chọn từ danh mục. Lọc theo nhóm để xem đầy đủ sản phẩm cùng loại.</p></div>
      <div className="catalog-toolbar">
        <div className="filter-list" role="group" aria-label="Lọc sản phẩm theo danh mục">
          <button type="button" aria-pressed={selectedCategory === 'all'} onClick={() => select('all')}>Tất cả</button>
          {categories.map((category) => <button key={category.id} type="button" aria-pressed={selectedCategory === category.id} onClick={() => select(category.id)}>{category.name}</button>)}
        </div>
        <p className="result-count" role="status" aria-live="polite">Hiển thị <strong>{visible.length}</strong> / {products.length} sản phẩm{selectedCategory !== 'all' && ` · ${categories.find((category) => category.id === selectedCategory)?.name}`}</p>
      </div>
      <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      {selectedCategory === 'all' && <div className="catalog-more"><button className="button button-outline" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Thu gọn về 12 sản phẩm' : `Xem toàn bộ ${products.length} sản phẩm`}<Icon name="arrow" size={18} /></button></div>}
      <p className="catalog-note">Giá và thông tin lấy từ dữ liệu mẫu của nhóm, không phải báo giá hiện hành. Model và giá của TB29–TB31 là giả định; toàn bộ ảnh chỉ mang tính minh họa.</p>
    </div>
  </section>
}
