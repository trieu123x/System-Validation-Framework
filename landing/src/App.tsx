import { useState } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import Categories from './components/Categories'
import ProductCatalog from './components/ProductCatalog'
import Branches from './components/Branches'
import Footer from './components/Footer'

export default function App() {
  const [category, setCategory] = useState('all')

  function selectCategory(id: string, scroll = false) {
    setCategory(id)
    if (scroll) {
      document.getElementById('products-title')?.focus({ preventScroll: true })
      document.getElementById('san-pham')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      })
    }
  }

  return <>
    <a href="#main" className="skip-link">Chuyển đến nội dung chính</a>
    <Header />
    <main id="main" tabIndex={-1}>
      <Hero />
      <Categories onSelect={selectCategory} />
      <ProductCatalog selectedCategory={category} onSelect={selectCategory} />
      <Branches />
    </main>
    <Footer />
  </>
}
