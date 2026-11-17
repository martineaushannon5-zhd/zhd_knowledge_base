import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const productionCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const developmentCsp = productionCsp
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace(
    "connect-src 'none'",
    "connect-src 'self' http://127.0.0.1:5173 http://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5173",
  )

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    {
      name: 'local-content-security-policy',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replace('__APP_CSP__', command === 'serve' ? developmentCsp : productionCsp),
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
}))
