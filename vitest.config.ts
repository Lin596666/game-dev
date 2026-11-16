import { defineConfig } from 'vitest/config'

// 单元测试只跑纯 TS 的 core 层，不需要 Vue/浏览器环境，
// 因此这里不加载 vite 插件，避免 vite 与 vitest 自带 vite 的类型/实例冲突。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
