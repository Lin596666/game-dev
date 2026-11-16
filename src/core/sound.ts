/**
 * 珠子落盘的声音。
 *
 * 不用任何音频素材：一颗塑料珠子的声音其实很接近"很短的带通噪声"，
 * 用 WebAudio 现合成既能零体积，也能随机一点音高，听着不呆板。
 * 浏览器的自动播放策略要求用户先有交互——我们都是在点击/拖动里调用，
 * 所以第一次调用时 resume 一下就够。
 */
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let last = 0

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
  }
  return ctx
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise) return noise
  const len = Math.floor(ac.sampleRate * 0.09)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    // 前 8ms 起音，后面指数衰减，听起来才像"磕"一下而不是"嘶"
    const t = i / len
    ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3)
  }
  noise = buf
  return buf
}

/** 拼上一颗豆子时的轻响；连续拖动会节流，避免变成一串噪音 */
export function playBeadTick(detune = 0): void {
  const now = performance.now()
  if (now - last < 42) return
  last = now
  const ac = ensure()
  if (!ac) return

  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  src.playbackRate.value = 0.92 + Math.random() * 0.2 + detune

  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2100 + Math.random() * 900
  band.Q.value = 1.4

  const gain = ac.createGain()
  const peak = 0.11
  gain.gain.setValueAtTime(0.0001, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.085)

  src.connect(band).connect(gain).connect(ac.destination)
  src.start()
  src.stop(ac.currentTime + 0.1)
}

/** 完成一颗 / 拼完一批时的更软的一声 */
export function playChime(): void {
  const ac = ensure()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ac.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12)
  gain.gain.setValueAtTime(0.0001, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.28)
  osc.connect(gain).connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + 0.3)
}
