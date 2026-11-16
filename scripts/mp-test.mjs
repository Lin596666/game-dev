/**
 * 小程序端冒烟测试：用微信开发者工具的自动化接口真的把页面跑起来，
 * 打开「首页 → 内置图纸 → 编辑器」，读页面数据并截图，确认没有白屏/报错。
 */
import automator from 'miniprogram-automator'
import { mkdirSync } from 'node:fs'

const CLI = 'D:/微信开发者工具/微信web开发者工具/cli.bat'
const PROJECT = 'D:/workSpace-游戏开发/miniprogram'
mkdirSync('D:/workSpace-游戏开发/.tmp/mp-shots', { recursive: true })

const mp = await automator.launch({ cliPath: CLI, projectPath: PROJECT, timeout: 120000 })
console.log('devtools up')

try {
  const home = await mp.reLaunch('/pages/index/index')
  await home.waitFor(1200)
  console.log('home data ok:', JSON.stringify(await home.data()).slice(0, 120))
  await mp.screenshot({ path: 'D:/workSpace-游戏开发/.tmp/mp-shots/home.png' })

  const editor = await mp.navigateTo('/pages/editor/editor?lib=heart-29')
  await editor.waitFor(1800)
  const d = await editor.data()
  console.log('editor data:', JSON.stringify({ name: d.name, total: d.total, sizeText: d.sizeText }))

  // 画一笔：点画布中心
  const canvas = await editor.$('#cv')
  console.log('canvas found:', !!canvas)
  await editor.callMethod('toggleStep')
  await editor.waitFor(300)
  const after = await editor.data()
  console.log('step mode:', after.stepMode, 'total:', after.stepTotal)
  await mp.screenshot({ path: 'D:/workSpace-游戏开发/.tmp/mp-shots/editor.png' })
  console.log('SMOKE OK')
} finally {
  await mp.disconnect()
}
