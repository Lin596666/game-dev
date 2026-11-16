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
        // three.js 的 3D 预览 chunk 很大，不放进首屏预缓存，改成用到时候再缓存
        globIgnores: ['**/three.module-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/three\.module-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'bead-three' }
          }
        ],
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
    cssCodeSplit: false,
    // three.js 是懒加载的独立 chunk（约 690KB），首屏不受影响，单独放宽告警阈值
    chunkSizeWarningLimit: 900
  }
})
