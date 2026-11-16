import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['bead.svg'],
      manifest: {
        name: '拼豆工房 · Bead Atelier',
        short_name: '拼豆工房',
        description: '随心拼豆、跟着图纸拼、导入图片转换成拼豆图纸',
        lang: 'zh-CN',
        theme_color: '#FBF7F1',
        background_color: '#FBF7F1',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'bead.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    target: 'es2020',
    cssCodeSplit: false
  }
})
