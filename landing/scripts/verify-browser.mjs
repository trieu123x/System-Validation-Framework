// Browser QA against a production preview. Tooling is installed separately in
// artifacts/tooling/ so it does not change the landing application's dependencies.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.argv[2] ?? process.env.QA_URL ?? 'http://127.0.0.1:4173/'
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const tools = process.env.TOBOKI_QA_TOOLS ?? join(root, 'artifacts/tooling')
const { chromium } = await import(pathToFileURL(join(tools, 'node_modules/playwright-core/index.mjs')).href)
const artifactRoot = join(root, 'artifacts')
await mkdir(join(artifactRoot, 'screenshots'), { recursive: true })
await mkdir(join(artifactRoot, 'qa'), { recursive: true })
const report = { url: baseUrl, timestamp: new Date().toISOString(), chromePath, node: process.version, checks: [], viewports: [], errors: [], network: [], cancelledImageRequests: [] }
const categories = JSON.parse(await readFile(join(root, 'src/data/categories.json'), 'utf8'))
const products = JSON.parse(await readFile(join(root, 'src/data/products.json'), 'utf8'))
function check(name, passed, details = '') {
  report.checks.push({ name, passed: Boolean(passed), details })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details ? `: ${details}` : ''}`)
}

async function carouselState(page) {
  return page.locator('.hero-visual[data-product-id]').evaluate(element => {
    const counter = element.querySelector('.slide-counter')?.textContent.match(/(\d+)\s*\/\s*(\d+)/)
    const image = element.querySelector('.hero-image-wrap img')
    return {
      id: element.dataset.productId,
      index: counter ? Number(counter[1]) : null,
      total: counter ? Number(counter[2]) : null,
      caption: element.querySelector('#hero-product-caption')?.textContent,
      image: image?.getAttribute('src'),
      alt: image?.getAttribute('alt'),
    }
  })
}

function matchesProduct(state, index) {
  const product = products[index]
  return state.id === product.id && state.index === index + 1 && state.total === products.length
    && state.caption?.includes(product.category)
    && state.caption?.includes(product.model ?? product.name)
    && state.caption?.includes(product.name)
    && state.image?.endsWith(product.image.url.split('/').at(-1))
    && state.alt?.includes(product.name)
}

async function verifyCarousel(page) {
  const hero = page.locator('.hero-visual[data-product-id]')
  const next = page.getByRole('button', { name: 'Sản phẩm tiếp theo', exact: true })
  const previous = page.getByRole('button', { name: 'Sản phẩm trước', exact: true })
  // Preserve a non-default filter to catch accidental coupling with the catalog.
  await page.locator('.filter-list button').nth(2).click()
  await next.scrollIntoViewIfNeeded()
  const catalogSnapshot = () => page.evaluate(() => ({
    y: scrollY, hash: location.hash,
    selected: document.querySelector('.filter-list button[aria-pressed="true"]')?.textContent,
    ids: [...document.querySelectorAll('#san-pham [data-product-id]')].map(card => card.dataset.productId),
  }))
  async function settleImage() {
    await page.waitForFunction(() => document.querySelector('.hero-image-wrap img')?.complete, undefined, { timeout: 15000 }).catch(() => {})
    await hero.locator('.hero-image-wrap img').evaluate(image => Promise.race([
      image.decode().catch(() => {}), new Promise(resolveImage => setTimeout(resolveImage, 6000)),
    ]))
  }
  async function move(button, expectedIndex, label, key) {
    await button.focus()
    const before = await catalogSnapshot()
    const oldImage = await hero.locator('.hero-image-wrap img').elementHandle()
    if (key) await button.press(key)
    else await button.click()
    await page.waitForFunction(id => document.querySelector('.hero-visual')?.dataset.productId === id, products[expectedIndex].id)
    await settleImage()
    const state = await carouselState(page)
    check(`Carousel ${label}: counter, caption and image match ${products[expectedIndex].id}`, matchesProduct(state, expectedIndex), JSON.stringify(state))
    const after = await catalogSnapshot()
    check(`Carousel ${label}: keeps scroll, hash, filter and product list`, Math.abs(after.y - before.y) <= 1 && before.hash === after.hash && before.selected === after.selected && JSON.stringify(before.ids) === JSON.stringify(after.ids))
    check(`Carousel ${label}: keeps focus on its control`, await button.evaluate(element => element === document.activeElement))
    check(`Carousel ${label}: remounts product image`, oldImage !== null && !await oldImage.evaluate(element => element.isConnected))
  }
  await move(next, 1, 'next')
  await move(previous, 0, 'previous')
  await move(previous, products.length - 1, 'previous wraps to last')
  await move(next, 0, 'next wraps to first')
  await move(next, 1, 'Enter activates next', 'Enter')
  await move(previous, 0, 'ArrowLeft activates previous', 'ArrowLeft')
  await move(next, 1, 'ArrowRight activates next', 'ArrowRight')
  await move(previous, 0, 'restore initial')
  // Visit the two accessories without model numbers and check their name fallback.
  for (let index = products.length - 1; index >= 25; index--) {
    await previous.click()
    await settleImage()
    if (products[index].model === null) {
      check(`Carousel ${products[index].id}: null model falls back to product name`, matchesProduct(await carouselState(page), index))
    }
  }
  // A failed image on one slide must not carry its fallback state into the next.
  await hero.locator('.hero-image-wrap img').dispatchEvent('error')
  check('Carousel simulated image failure shows accessible fallback', await hero.locator('.image-fallback').count() === 1)
  await next.click()
  await settleImage()
  check('Carousel next slide resets failed-image state', await hero.locator('.image-fallback').count() === 0 && matchesProduct(await carouselState(page), 26))
  for (let index = 27; index <= products.length; index++) { await next.click(); await settleImage() }
  check('Carousel restored to first slide after coverage', matchesProduct(await carouselState(page), 0))
  await page.locator('.filter-list button').first().click()
}
let browser
try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true, chromiumSandbox: true, timeout: 15000 })
  report.browser = browser.version()
  console.log(`Chrome connected: ${report.browser}`)
  // The social image is authored locally as SVG; render it to a shareable PNG.
  const socialPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await socialPage.goto(pathToFileURL(join(root, 'public/social-preview.svg')).href)
  await socialPage.screenshot({ path: join(root, 'public/social-preview.png') })
  await socialPage.close()
  console.log('Rendered public/social-preview.png')

  for (const [name, width, height, mobile] of [['desktop', 1440, 1000, false], ['tablet', 768, 1024, false], ['mobile', 360, 800, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => report.errors.push({ viewport: name, type: 'pageerror', message: error.message }))
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ viewport: name, type: 'console', message: message.text() }) })
    page.on('requestfailed', request => {
      const failure = { viewport: name, url: request.url(), error: request.failure()?.errorText }
      if (request.resourceType() === 'image' && failure.error === 'net::ERR_ABORTED') report.cancelledImageRequests.push(failure)
      else report.network.push(failure)
    })
    page.on('response', response => { if (response.status() >= 400) report.network.push({ viewport: name, url: response.url(), status: response.status() }) })
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    check(`${name}: page responds HTTP 200`, response?.status() === 200)
    await page.locator('#san-pham [data-product-id]').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    const initial = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, products: document.querySelectorAll('#san-pham [data-product-id]').length, branches: document.querySelectorAll('[data-branch-id]').length, categories: document.querySelectorAll('.category-card').length, filters: document.querySelectorAll('.filter-list button').length, title: document.title, lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length }))
    check(`${name}: no horizontal overflow`, initial.scrollWidth <= initial.width, `${initial.scrollWidth}/${initial.width}px`)
    check(`${name}: 12 featured products`, initial.products === 12, initial.products)
    check(`${name}: 15 branches`, initial.branches === 15, initial.branches)
    check(`${name}: 7 primary categories and 10 category filters`, initial.categories === 7 && initial.filters === 11, `${initial.categories}/${initial.filters}`)
    check(`${name}: Vietnamese metadata and one H1`, initial.lang === 'vi' && initial.h1 === 1 && initial.title.includes('TOBOKI'))
    check(`${name}: carousel starts at TB01 with counter 01/31 and matching content`, matchesProduct(await carouselState(page), 0))
    if (width < 850) {
      const toggle = page.getByRole('button', { name: 'Mở menu' })
      check(`${name}: menu initially closed`, await toggle.getAttribute('aria-expanded') === 'false' && !await page.locator('#main-navigation').isVisible())
      await toggle.click()
      check(`${name}: menu opens`, await page.getByRole('button', { name: 'Đóng menu' }).getAttribute('aria-expanded') === 'true' && await page.locator('#main-navigation').isVisible())
      await page.locator('#main-navigation a').first().focus()
      await page.keyboard.press('Escape')
      check(`${name}: Escape closes menu and restores focus`, await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false' && await page.locator('.menu-toggle').evaluate(element => element === document.activeElement))
    }
    // Scroll to trigger lazy image loading before full-page handoff screenshots.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        scrollTo(0, y)
        await new Promise(resolveWait => setTimeout(resolveWait, 70))
      }
      scrollTo(0, 0)
    })
    await page.waitForFunction(() => [...document.images].every(image => image.complete), undefined, { timeout: 15000 }).catch(() => {})
    await page.evaluate(async () => {
      await Promise.race([
        Promise.all([...document.images].map(image => image.decode().catch(() => {}))),
        new Promise(resolveDecode => setTimeout(resolveDecode, 5000)),
      ])
      await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)))
    })
    const imageBoxes = await page.locator('#san-pham .product-image').evaluateAll(boxes => boxes.map(box => {
      const rect = box.getBoundingClientRect()
      return { id: box.closest('[data-product-id]').dataset.productId, width: rect.width, height: rect.height }
    }))
    check(`${name}: product image boxes keep their intended aspect ratio`, imageBoxes.every(box => box.height / box.width <= 1.1), JSON.stringify(imageBoxes.filter(box => box.height / box.width > 1.1)))
    const imageState = await page.evaluate(() => ({ loaded: [...document.images].filter(image => image.complete && image.naturalWidth > 0).length, pending: [...document.images].filter(image => !image.complete).map(image => image.currentSrc), broken: [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.currentSrc), fallbacks: document.querySelectorAll('.image-fallback').length, missingAlt: [...document.images].filter(image => !image.hasAttribute('alt')).length }))
    check(`${name}: images have alt`, imageState.missingAlt === 0)
    check(`${name}: images loaded without fallback`, imageState.pending.length === 0 && imageState.broken.length === 0 && imageState.fallbacks === 0, `${imageState.loaded} loaded, ${imageState.pending.length} pending, ${imageState.fallbacks} fallbacks`)
    await page.screenshot({ path: join(artifactRoot, 'screenshots', `${name}-${width}.png`), fullPage: true })
    report.viewports.push({ name, ...initial, imageBoxes, images: imageState })
    if (name === 'desktop') {
      await page.locator('.catalog-more button').click()
      check('Expand shows all 31 products', await page.locator('#san-pham [data-product-id]').count() === 31)
      for (let index = 0; index < categories.length; index++) {
        await page.locator('.filter-list button').nth(index + 1).click()
        const expected = products.filter(product => product.categoryId === categories[index].id).length
        const ids = await page.locator('#san-pham [data-product-id]').evaluateAll(cards => cards.map(card => card.dataset.categoryId))
        check(`Filter ${categories[index].id}`, ids.length === expected && ids.every(id => id === categories[index].id) && await page.locator('.filter-list button[aria-pressed="true"]').count() === 1, `${ids.length}/${expected}`)
      }
      await page.locator('.filter-list button').first().click()
      check('Reset returns 12 featured products', await page.locator('#san-pham [data-product-id]').count() === 12)
      await page.locator('.category-card').first().click()
      const firstCategoryCount = products.filter(product => product.categoryId === categories[0].id).length
      check('Category card filters products and focuses heading', await page.locator('#san-pham [data-product-id]').count() === firstCategoryCount && await page.locator('#products-title').evaluate(element => element === document.activeElement))
      await page.locator('.filter-list button').first().click()
      await page.locator('.skip-link').focus()
      await page.keyboard.press('Enter')
      check('Keyboard skip link focuses main', await page.locator('#main').evaluate(element => element === document.activeElement))
      const unsafe = await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => /^(javascript|data):/i.test(href)))
      check('Links have no unsafe URL schemes', unsafe.length === 0)
      await verifyCarousel(page)
    }
    await context.close()
  }
  check('No application page errors', report.errors.filter(error => error.type === 'pageerror').length === 0)
  check('No browser console errors', report.errors.length === 0, report.errors.length)
  console.log(`Browser checks: ${report.checks.filter(item => item.passed).length}/${report.checks.length} passed; ${report.network.length} network issues.`)
  if (report.checks.some(item => !item.passed)) process.exitCode = 1
} catch (error) {
  report.fatalError = String(error.stack ?? error)
  console.error(report.fatalError)
  process.exitCode = 1
} finally {
  await writeFile(join(artifactRoot, 'qa/browser-checks.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser?.close()
}
