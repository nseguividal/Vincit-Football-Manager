import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuració estàndard per a SPA (Cloudflare Pages, etc.)
export default defineConfig({
  plugins: [react()],
  base: '/',
})
