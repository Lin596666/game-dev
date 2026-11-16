/**
 * 微信小程序端的入口：把 src/core 里与 DOM 无关的纯逻辑打包成一份 CommonJS。
 *
 * 为什么不直接在小程序里引 src/core/*.ts：
 * 小程序不认识 TypeScript，也没有 Vite；用 esbuild 打成一个文件最简单，
 * 而且 core 层从一开始就写成零 DOM 依赖，正好原样复用。
 *
 * 生成物：miniprogram/miniprogram/core/index.js（由 npm run mp:build 产出）
 */
export { BeadGrid, EMPTY } from '../core/grid'
export {
  COLORS,
  COLOR_SETS,
  colorById,
  colorByHex,
  nearestColorToRgb,
  groupedColors,
  inkOn
} from '../core/colors'
export { UndoStack, diffSnapshot } from '../core/history'
export { colorUsage, totalBeads, estimateCost, instructionText } from '../core/pattern'
export {
  createProjectFile,
  parseProjectFile,
  parseProjectText,
  cellsToBase64,
  base64ToCells
} from '../core/project'
export { LIBRARY } from '../core/library'
export { fitToColorSet, fitToColors, colorsOfSet } from '../core/palette'
export { physicalInfo, printLayout, BEAD_MM, BOARD_SIZE } from '../core/physical'
export { quantizeImage } from '../core/quantize'
export { IRON_FINISHES, finishById, sparkleAt, RAINBOW_COLORS } from '../core/iron'
export { encodeShare, decodeShare, shareCodeFromUrl } from '../core/share'
export { stockReport, purchaseText } from '../core/stock'
