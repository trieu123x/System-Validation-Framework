import { useState } from 'react'
import { imageUrl } from '../lib/catalog'
import type { Product } from '../lib/catalog'

type Props = {
  product: Product
  priority?: boolean
  sizes?: string
  className?: string
}

export default function ProductImage({ product, priority = false, sizes = '(max-width: 600px) 85vw, (max-width: 1000px) 40vw, 280px', className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={`image-fallback ${className}`} role="img" aria-label={`Chưa tải được ảnh ${product.name}`}><span>TOBOKI</span><small>Chưa tải được ảnh sản phẩm</small></div>

  return <img
    className={className}
    src={imageUrl(product.image.url, 480)}
    srcSet={`${imageUrl(product.image.url, 240)} 240w, ${imageUrl(product.image.url, 480)} 480w, ${imageUrl(product.image.url, 720)} 720w`}
    sizes={sizes}
    alt={`Ảnh ${product.name}`}
    width="720"
    height="720"
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
    onError={() => setFailed(true)}
  />
}
