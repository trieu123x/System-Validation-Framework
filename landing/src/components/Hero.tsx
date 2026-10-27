import { useState } from 'react'
import { products, systemLinks } from '../lib/catalog'
import ProductImage from './ProductImage'
import Icon from './Icon'

export default function Hero() {
  const [slide, setSlide] = useState(0)
  const product = products[slide]
  const position = String(slide + 1).padStart(2, '0')

  function moveSlide(direction: number) {
    setSlide((current) => (current + direction + products.length) % products.length)
  }

  return <section className="hero-section" aria-labelledby="hero-title">
    <div className="page-width hero-layout">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-line" /> THIẾT BỊ CHO TỪNG CÔNG VIỆC</p>
        <h1 id="hero-title">Vững thiết bị.<br /><span>Tiếp sức</span><br />mọi công trình.</h1>
        <p className="hero-description">TOBOKI cung cấp máy móc và thiết bị cho công trình, nhà xưởng và nhu cầu thương mại.</p>
        <div className="hero-actions">
          <a className="button button-orange" href="#san-pham">Xem sản phẩm <Icon name="arrow" /></a>
          {systemLinks.admin && <a className="text-link" href={systemLinks.admin}>Đăng nhập quản trị <span aria-hidden="true">↗</span></a>}
        </div>
        
      </div>
      <div className="hero-visual" role="region" aria-roledescription="bộ trình chiếu" aria-label="Sản phẩm TOBOKI" data-product-id={product.id} onKeyDown={(event) => {
        if (!(event.target instanceof HTMLButtonElement)) return
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault()
          moveSlide(event.key === 'ArrowRight' ? 1 : -1)
        }
      }}>
        <div className="hero-grid" aria-hidden="true" />
        <span className="hero-backdrop-letter" aria-hidden="true">T</span>
        <div className="visual-topline"><span>TOBOKI / EQUIPMENT</span><span className="slide-counter"><span className="sr-only">Sản phẩm </span>{position} / {products.length}</span></div>
        <div className="hero-image-wrap"><ProductImage key={product.id} product={product} priority sizes="(max-width: 760px) 85vw, 520px" /></div>
        <div className="equipment-label">
          <span className="label-index">{product.id}</span>
          <div id="hero-product-caption" className="equipment-details" aria-live="polite" aria-atomic="true">
            <span className="sr-only">Sản phẩm {slide + 1} trên {products.length}. </span>
            <span>{product.category}</span>
            <strong>{product.model ?? product.name}</strong>
            {product.model && <small className="equipment-name">{product.name}</small>}
          </div>
          <div className="carousel-controls">
            <button type="button" className="carousel-previous" aria-label="Sản phẩm trước" aria-controls="hero-product-caption" onClick={() => moveSlide(-1)}><Icon name="arrow" size={20} /></button>
            <button type="button" className="carousel-next" aria-label="Sản phẩm tiếp theo" aria-controls="hero-product-caption" onClick={() => moveSlide(1)}><Icon name="arrow" size={20} /></button>
          </div>
        </div>
        <div className="hero-visual-footer"><span>Ảnh thiết bị mang tính minh họa</span><a href={product.image.source} target="_blank" rel="noreferrer">Nguồn ảnh ↗</a></div>
      </div>
    </div>
  </section>
}
