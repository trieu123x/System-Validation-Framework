import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const landingDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireTool = createRequire(resolve(landingDir, 'artifacts/tooling/package.json'))
const { default: lighthouse } = await import(pathToFileURL(requireTool.resolve('lighthouse')).href)
const { launch } = await import(pathToFileURL(requireTool.resolve('chrome-launcher')).href)
const outputDir = resolve(landingDir, 'artifacts/lighthouse')
const url = process.env.QA_URL || 'http://127.0.0.1:4173/'
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
await access(chromePath)
await mkdir(outputDir, { recursive: true })
const results = []

for (const profile of ['mobile', 'desktop']) {
  const chrome = await launch({ chromePath, chromeFlags: ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions'] })
  try {
    const options = { port: chrome.port, onlyCategories: ['performance', 'accessibility'], output: ['json', 'html'], logLevel: 'error' }
    if (profile === 'desktop') Object.assign(options, {
      formFactor: 'desktop',
      screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
    })
    const result = await lighthouse(url, options)
    if (!result || result.lhr.runtimeError) throw new Error(result?.lhr.runtimeError?.message || 'Lighthouse khong tao duoc report')
    const [json, html] = result.report
    await writeFile(resolve(outputDir, `${profile}.report.json`), json)
    await writeFile(resolve(outputDir, `${profile}.report.html`), html)
    const scores = {
      profile,
      fetchTime: result.lhr.fetchTime,
      performance: Math.round(result.lhr.categories.performance.score * 100),
      accessibility: Math.round(result.lhr.categories.accessibility.score * 100),
      lcp: result.lhr.audits['largest-contentful-paint'].displayValue,
      cls: result.lhr.audits['cumulative-layout-shift'].displayValue,
      failedAccessibilityAudits: Object.values(result.lhr.audits).filter((audit) => audit.score === 0 && result.lhr.categories.accessibility.auditRefs.some((ref) => ref.id === audit.id)).map((audit) => ({ id: audit.id, title: audit.title })),
      lighthouseVersion: result.lhr.lighthouseVersion,
      userAgent: result.lhr.userAgent,
    }
    results.push(scores)
    console.log(JSON.stringify(scores))
  } finally {
    await chrome.kill()
  }
}
await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify({ url, results }, null, 2) + '\n')
if (results.some((result) => result.performance < 90 || result.accessibility < 90)) process.exitCode = 1
