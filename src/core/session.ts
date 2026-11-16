/**
 * 久坐提醒的纯计算部分：只有分钟数，没有 DOM、没有 store，
 * 这样规则本身能被单元测试固定住。
 */

/** 默认每 45 分钟提醒一次 */
export const REST_EVERY_MINUTES = 45

/** 距离下一次提醒还有几分钟（刚提醒完的那一刻返回 every） */
export function nextRestIn(minutes: number, every = REST_EVERY_MINUTES): number {
  if (every <= 0) return 0
  const m = Math.max(0, Math.floor(minutes))
  return every - (m % every)
}

/**
 * 当前该不该提醒：返回已经跨过的最近一个整点分钟。
 * 0 表示还不到第一轮；调用方记住上次的值，变大就是要提醒了。
 */
export function restMilestone(minutes: number, every = REST_EVERY_MINUTES): number {
  if (every <= 0) return 0
  const m = Math.max(0, Math.floor(minutes))
  return Math.floor(m / every) * every
}
