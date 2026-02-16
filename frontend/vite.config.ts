import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/uploads': 'http://localhost:3001',
    },
  },
})
