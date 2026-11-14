import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves from https://<user>.github.io/<repo>/ by default.
// Set VITE_BASE (e.g. "/telegup/") when deploying to a project page; leave
// empty for a user page or a custom domain. The app uses HashRouter, so
// no 404.html rewrite is needed.
const base = process.env.VITE_BASE ?? '/'

// Куда писать сборку. Основной сайт — в `dist`, dev-канал — в `dist/dev`
// (см. deploy.yml / deploy-cloudflare.yml): обе сборки едут одним артефактом.
const outDir = process.env.VITE_OUT_DIR ?? 'dist'

// Канал сборки: `dev` включает ранние фичи и закрывает сайт владельцем.
// Читается из окружения сборки, а не из адреса — на обычном сайте включить
// «dev» нельзя.
const channel = process.env.VITE_CHANNEL === 'dev' ? 'dev' : 'stable'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  define: {
    // `import.meta.env` в Vite видит только переменные из `.env*`, поэтому
    // канал подставляем литералом — заодно он попадает в сборку как константа
    'import.meta.env.VITE_CHANNEL': JSON.stringify(channel),
  },
  build: { outDir },
  server: { watch: { ignored: ["**/public/gifts/**"] } },
})