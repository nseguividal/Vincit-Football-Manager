import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel serveix des de l'arrel, per això base: '/'.
// Si mai despleguessis a GitHub Pages a un subdirectori (usuari.github.io/repo/),
// canvia base per '/repo/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
