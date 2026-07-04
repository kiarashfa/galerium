import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes every asset URL relative, so the built site works from
// any subpath (e.g. GitHub Pages project sites) without config changes.
export default defineConfig({
  base: './',
  plugins: [react()],
})
