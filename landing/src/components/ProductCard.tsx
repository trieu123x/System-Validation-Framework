import { formatPrice } from '../lib/catalog'
import type { Product } from '../lib/catalog'
import ProductImage from './ProductImage'

export default function ProductCard({ product }: { product: Product }) {
  const isNew = Number(product.categoryId.slice(2)) > 7
  return <article className="product-card" data-product-id={product.id} data-category-id={product.categoryId}>
    <div className="product-image"><span className="product-code">{product.id}</span>{isNew && <span className="new-badge">Nhóm mới</span>}<ProductImage product={product} /></div>
    <div className="product-info">
      <p className="product-category">{product.category}</p>
      <h3>{product.name}</h3>
      <p className="product-model">{product.model ? `Model: ${product.model}` : 'Phụ kiện thiết bị'}</p>
      <div className="product-price"><span>Giá bán lẻ tham khảo</span><strong>{formatPrice(product.retailPrice)}</strong></div>
      <a className="product-credit" href={product.image.source} target="_blank" rel="noreferrer">Ảnh minh họa: {product.image.artist} ↗</a>
    </div>
  </article>
}
