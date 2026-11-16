/**
 * 构建入口包装
 *
 * 为什么需要它：esbuild 会把自己处理过的临时文件放在系统 TEMP 里再删除。
 * 在 Windows 上如果系统 TEMP 被安全软件（Defender 实时扫描、某些同步盘）
 * 占用，删除会抛 `Access is denied`，构建直接失败：
 *
 *   [vite:esbuild-transpile] remove C:\Users\xxx\AppData\Local\Temp\esbuild-xxx: Access is denied.
 *
 * 这里把 TEMP/TMP 指到项目内的 .tmp，构建结束后再清理，绕开被锁的系统目录。
 * 注意：环境变量必须在 vite 启动 esbuild 之前设置，所以这里直接调 vite 的 Node API，
 * 而不是 spawn 一个子进程。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = join(root, '.tmp')
mkdirSync(tmp, { recursive: true })

process.env.TEMP = tmp
process.env.TMP = tmp
process.env.TMPDIR = tmp

const { build } = await import('vite')

try {
  await build()
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  // 清理失败不影响构建结果（可能有句柄没释放完）
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* 留着下次复用 */
  }
}
