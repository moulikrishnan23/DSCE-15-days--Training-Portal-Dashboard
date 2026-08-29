import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-proxy': {
        target: 'https://script.google.com',
        changeOrigin: true,
        secure: false,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
      }
    }
  }
})
