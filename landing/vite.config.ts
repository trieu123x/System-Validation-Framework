import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = env.VITE_SITE_URL?.trim()
  if (siteUrl && !/^https?:\/\//.test(siteUrl)) {
    throw new Error('VITE_SITE_URL phai la URL http/https day du')
  }

  return {
    plugins: [react(), tailwindcss(), {
      name: 'landing-social-metadata',
      transformIndexHtml(html) {
        if (!siteUrl) return html
        const image = new URL('social-preview.png', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href
        return {
          html: html.replace('content="/social-preview.png"', `content="${image.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`),
          tags: [
            { tag: 'meta', attrs: { property: 'og:url', content: siteUrl }, injectTo: 'head' },
            { tag: 'link', attrs: { rel: 'canonical', href: siteUrl }, injectTo: 'head' },
          ],
        }
      },
    }],
  }
})
