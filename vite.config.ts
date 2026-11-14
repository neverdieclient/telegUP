import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves from https://<user>.github.io/<repo>/ by default.
// Set VITE_BASE (e.g. "/telegup/") when deploying to a project page; leave
// empty for a user page or a custom domain. The app uses HashRouter, so
// no 404.html rewrite is needed.
const base = process.env.VITE_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
  server: { watch: { ignored: ["**/public/gifts/**"] } },
})
