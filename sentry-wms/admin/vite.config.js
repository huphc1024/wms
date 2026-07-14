import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sri } from 'vite-plugin-sri3'

export default defineConfig({
  // V-046: add Subresource Integrity (sha384) to every <script> and
  // stylesheet tag in the built index.html so a compromised CDN or
  // static host cannot swap the bundle without the browser noticing.
  // Only runs on build; dev server is unaffected.
  plugins: [react(), sri()],
  server: {
    port: 4000,
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://127.0.0.1:5000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  }
})
