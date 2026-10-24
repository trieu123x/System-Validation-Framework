import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const landingDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const script of ['verify-browser.mjs', 'audit-lighthouse.mjs']) {
  const status = await new Promise((resolveStatus, reject) => {
    const child = spawn(process.execPath, [resolve(landingDir, 'scripts', script)], { cwd: landingDir, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => resolveStatus(code ?? 1))
  })
  if (status !== 0) { process.exitCode = Number(status); break }
}
