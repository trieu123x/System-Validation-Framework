import productsData from '../data/products.json'
import categoriesData from '../data/categories.json'

export type Product = (typeof productsData)[number]
export const products = productsData
export const categories = categoriesData
export const featuredIds = ['TB01', 'TB02', 'TB06', 'TB09', 'TB16', 'TB17', 'TB22', 'TB26', 'TB28', 'TB29', 'TB30', 'TB31']
export const featuredProducts = featuredIds.map((id) => products.find((product) => product.id === id)!)

const priceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
export const formatPrice = (price: number) => `${priceFormatter.format(price)} đ`

export function imageUrl(url: string, width: number) {
  return url.replace('/image/upload/', `/image/upload/c_limit,w_${width},f_auto,q_auto/`)
}

export function licenseUrl(license: string) {
  if (license === 'CC0') return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (license === 'Public domain') return 'https://creativecommons.org/publicdomain/mark/1.0/'
  const match = /^CC (BY(?:-SA)?) ([\d.]+)(?: (us))?$/.exec(license)
  return match ? `https://creativecommons.org/licenses/${match[1].toLowerCase()}/${match[2]}/${match[3] ? 'us/' : ''}` : undefined
}

function publicLink(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export const systemLinks = {
  admin: publicLink(import.meta.env.VITE_ADMIN_URL),
  branch: publicLink(import.meta.env.VITE_BRANCH_URL),
}
