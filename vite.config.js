import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const EMULATOR = 'http://127.0.0.1:5001/svp-qr-generator/us-central1'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      // In dev, forward to the local Firebase Functions emulator
      '/api/signQR': {
        target:       EMULATOR,
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api\/signQR/, '/signQR'),
      },
      '/api/public-key': {
        target:       EMULATOR,
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api\/public-key/, '/getPublicKey'),
      },
    },
  },
})
