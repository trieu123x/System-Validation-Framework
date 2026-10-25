import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const landingDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDir = resolve(landingDir, '..')
const outputDir = resolve(landingDir, 'src/data')
const checkOnly = process.argv.includes('--check')
assert(process.argv.slice(2).every((arg) => arg === '--check'), 'Chỉ hỗ trợ tham số --check')

async function readSource(path) {
  return readFile(resolve(repositoryDir, path), 'utf8')
}

// Read literal VALUES tuples only; never execute SQL or connect to the database.
// SQL strings use two single quotes to escape a quote. Commas inside strings
// (e.g. product names and addresses) must not split a field.
function literalRows(sql, prefix) {
  const starts = new RegExp(`^[ \\t]*\\('(${prefix}\\d+)'`, 'gm')
  const rows = []
  let match
  while ((match = starts.exec(sql)) !== null) {
    const start = sql.indexOf('(', match.index)
    const row = []
    let token = ''
    let quoted = false
    let stringValue = false
    let ended = false
    const push = () => {
      if (stringValue) row.push(token)
      else if (token.trim().toUpperCase() === 'NULL') row.push(null)
      else {
        const value = Number(token.trim())
        assert(Number.isFinite(value) && token.trim() !== '', `Giá trị SQL không hỗ trợ: ${token}`)
        row.push(value)
      }
      token = ''
      stringValue = false
    }
    for (let index = start + 1; index < sql.length; index++) {
      const char = sql[index]
      if (quoted) {
        if (char === "'") {
          if (sql[index + 1] === "'") {
            token += "'"
            index++
          } else quoted = false
        } else token += char
      } else if (char === "'") {
        assert(token.trim() === '', `SQL không phải literal ở ${match[1]}`)
        token = ''
        stringValue = true
        quoted = true
      } else if (char === ',' || char === ')') {
        push()
        if (char === ')') {
          ended = true
          break
        }
      } else if (!stringValue || !/\s/.test(char)) token += char
    }
    assert(ended && !quoted, `Tuple SQL bị thiếu dấu đóng: ${match[1]}`)
    rows.push(row)
  }
  return rows
}

function uniqueById(rows, label) {
  const ids = new Set()
  for (const row of rows) {
    assert(!ids.has(row.id), `${label}: trùng mã ${row.id}`)
    ids.add(row.id)
  }
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

function expectSequence(rows, prefix, count) {
  assert.equal(rows.length, count, `Cần đủ ${count} bản ghi ${prefix}`)
  for (let index = 1; index <= count; index++) {
    assert.equal(rows[index - 1].id, `${prefix}${String(index).padStart(2, '0')}`)
  }
}

const [seed, newStock, demo, imagesSql, creditsJson, companyTs] = await Promise.all([
  readSource('db/seed.sql'),
  readSource('db/seed_hang_moi.sql'),
  readSource('db/seed_demo.sql'),
  readSource('db/seed_images.sql'),
  readSource('scripts/images/credits.json'),
  readSource('ui/lib/company.ts'),
])
const creditsByProduct = JSON.parse(creditsJson)
const imageUrls = new Map([...imagesSql.matchAll(/UPDATE san_pham SET anh_url = '([^']+)' WHERE ma_sp = '(TB\d+)';/g)].map((match) => [match[2], match[1]]))

const categoryRows = uniqueById(literalRows(`${seed}\n${newStock}`, 'DM').map(([id, name]) => ({ id, name })), 'Danh mục')
const products = uniqueById(literalRows(`${seed}\n${newStock}`, 'TB').map((row) => {
  assert.equal(row.length, 10, `Sai cấu trúc mặt hàng ${row[0]}`)
  const [id, categoryId, name, model, , , , retailPrice] = row
  const category = categoryRows.find((entry) => entry.id === categoryId)
  assert(category, `${id}: không tìm thấy danh mục ${categoryId}`)
  assert(Number.isInteger(retailPrice) && retailPrice > 0, `${id}: giá bán lẻ không hợp lệ`)
  assert(model === null || typeof model === 'string', `${id}: model không hợp lệ`)
  const credit = creditsByProduct[id]
  const url = imageUrls.get(id)
  assert(url && credit, `${id}: thiếu URL ảnh hoặc thông tin ghi công`)
  assert.equal(url, credit.url, `${id}: seed_images.sql và credits.json có URL khác nhau`)
  assert(credit.artist && credit.license && credit.page && credit.file, `${id}: thiếu tác giả, giấy phép hoặc nguồn ảnh`)
  assert.equal(new URL(url).hostname, 'res.cloudinary.com', `${id}: URL ảnh không phải Cloudinary`)
  assert.equal(new URL(credit.page).hostname, 'commons.wikimedia.org', `${id}: nguồn ảnh không phải Wikimedia Commons`)
  return { id, name, model, categoryId, category: category.name, retailPrice,
    image: { url, artist: credit.artist, license: credit.license, source: credit.page } }
}), 'Sản phẩm')

const categories = categoryRows.map((category) => {
  const representative = products.find((product) => product.categoryId === category.id)
  assert(representative, `${category.id}: không có sản phẩm đại diện`)
  return { ...category, primary: Number(category.id.slice(2)) <= 7, representativeProductId: representative.id }
})
const branches = uniqueById(literalRows(`${seed}\n${demo}`, 'CN').map(([id, name, address]) => ({ id, name, address })), 'Chi nhánh')
const company = Object.fromEntries(['brand', 'name', 'mst', 'address', 'hotline'].map((key) => {
  const match = companyTs.match(new RegExp(`${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`))
  assert(match, `company.ts thiếu ${key}`)
  return [key, JSON.parse(match[1])]
}))

expectSequence(products, 'TB', 31)
expectSequence(categories, 'DM', 10)
expectSequence(branches, 'CN', 15)
assert.equal(categories.filter((category) => category.primary).length, 7)

const imageCredits = []
for (const product of products) {
  let credit = imageCredits.find((entry) => entry.source === product.image.source)
  if (!credit) {
    credit = { source: product.image.source, title: creditsByProduct[product.id].file,
      artist: product.image.artist, license: product.image.license, products: [] }
    imageCredits.push(credit)
  }
  assert.equal(credit.artist, product.image.artist, `Tác giả không khớp cho ${product.id}`)
  assert.equal(credit.license, product.image.license, `Giấy phép không khớp cho ${product.id}`)
  credit.products.push({ id: product.id, url: product.image.url })
}

const outputs = { products, categories, branches, company, 'image-credits': imageCredits }
await mkdir(outputDir, { recursive: true })
for (const [name, data] of Object.entries(outputs)) {
  const path = resolve(outputDir, `${name}.json`)
  const content = `${JSON.stringify(data, null, 2)}\n`
  if (checkOnly) {
    const existing = await readFile(path, 'utf8')
    assert.equal(existing.replaceAll('\r\n', '\n'), content, `${name}.json chưa khớp dữ liệu nguồn; chạy node scripts/extract-data.mjs`)
  } else await writeFile(path, content, 'utf8')
}
console.log(`${checkOnly ? 'Kiểm tra' : 'Đã trích'}: ${products.length} sản phẩm, ${categories.length} danh mục (7 chính + 3 mới), ${branches.length} chi nhánh, ${imageCredits.length} nguồn ảnh. Không cần kết nối CSDL.`)
