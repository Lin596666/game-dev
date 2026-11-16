/**
 * 把 src/core 打包成小程序能 require 的 CommonJS 文件。
 *
 * 沿用 build.mjs 的思路：先把 TEMP 指到项目内，避免 Windows 上
 * esbuild 清理系统临时目录被拒（Access is denied）。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = resolve(root, '.tmp')
mkdirSync(tmp, { recursive: true })
process.env.TEMP = tmp
process.env.TMP = tmp
process.env.TMPDIR = tmp

const outfile = resolve(root, 'miniprogram/miniprogram/core/index.js')
mkdirSync(dirname(outfile), { recursive: true })

try {
  const { build } = await import('esbuild')
  const result = await build({
    entryPoints: [resolve(root, 'src/mp/entry.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: ['es2017'],
    charset: 'utf8',
    legalComments: 'none',
    outfile,
    metafile: true,
    logLevel: 'warning'
  })
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0
  console.log(`小程序 core 打包完成：miniprogram/miniprogram/core/index.js (${(bytes / 1024).toFixed(1)} kB)`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
