<script setup lang="ts">
/**
 * 3D 摆件预览
 *
 * 设计要点：
 * - three.js 只在打开这个弹窗时才动态 import，首屏完全不加载（单独 chunk，~150KB gzip）
 * - 珠子用 InstancedMesh：几千颗豆子也只是一次 draw call
 * - 珠子几何体用 LatheGeometry 车一个"垫圈"（外壁 / 上下环面 / 内孔壁），比圆环更像真豆
 * - 开场有一段逐行落下的动画，结束后停止逐帧写矩阵，避免白烧 GPU
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useEditorStore } from '@/store/editor'
import { colorById } from '@/core/colors'
import Modal from './Modal.vue'

const store = useEditorStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const hostEl = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const errorMsg = ref('')
const beadCount = ref(0)
const autoRotate = ref(true)
const tooMany = ref(false)

let cleanup: (() => void) | null = null

/** 珠子尺寸（格子间距 = 1） */
const R_OUT = 0.44
const R_IN = 0.18
const BEAD_H = 0.16
const MAX_BEADS = 30000

onMounted(async () => {
  const host = hostEl.value
  if (!host) return

  try {
    const THREE = await import('three')
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
    if (!hostEl.value) return

    const grid = store.grid
    const { width: gw, height: gh } = grid

    // ---------- 收集珠子 ----------
    const xs: number[] = []
    const zs: number[] = []
    const colors: number[] = []
    const rows: number[] = []

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const id = grid.get(x, y)
        if (!id) continue
        if (colors.length >= MAX_BEADS) {
          tooMany.value = true
          break
        }
        const c = colorById(id)
        xs.push(x - (gw - 1) / 2)
        zs.push(y - (gh - 1) / 2)
        colors.push(c ? parseInt(c.hex.slice(1), 16) : 0xcccccc)
        rows.push(y)
      }
    }

    const count = colors.length
    beadCount.value = count
    if (count === 0) {
      loading.value = false
      errorMsg.value = '这张图纸还是空的，先拼几颗豆子再来看看'
      return
    }

    // ---------- 场景 ----------
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#FBF7F1')

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.domElement.classList.add('scene-3d-canvas')
    host.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(36, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 3000)
    const span = Math.max(gw, gh)
    const dist = span * 1.55 + 6
    camera.position.set(dist * 0.42, dist * 0.72, dist * 0.62)
    camera.lookAt(0, 0, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.rotateSpeed = 0.75
    controls.zoomSpeed = 0.9
    controls.panSpeed = 0.6
    controls.enablePan = true
    controls.minDistance = span * 0.55 + 4
    controls.maxDistance = span * 4 + 30
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI * 0.49
    controls.autoRotate = autoRotate.value
    controls.autoRotateSpeed = 0.7
    controls.target.set(0, 0, 0)

    // ---------- 灯光 ----------
    const hemi = new THREE.HemisphereLight(0xffffff, 0xece2d4, 1.5)
    scene.add(hemi)

    const key = new THREE.DirectionalLight(0xfff6ee, 1.9)
    key.position.set(span * 0.9, span * 1.5, span * 0.8)
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xffe9e5, 0.55)
    fill.position.set(-span * 1.1, span * 0.7, -span * 0.6)
    scene.add(fill)

    const rim = new THREE.DirectionalLight(0xdff0e6, 0.4)
    rim.position.set(0, span * 0.4, -span * 1.2)
    scene.add(rim)

    // ---------- 底板（带插豆小孔的纸纹） ----------
    const boardCanvas = document.createElement('canvas')
    boardCanvas.width = boardCanvas.height = 64
    const bctx = boardCanvas.getContext('2d')
    if (bctx) {
      bctx.fillStyle = '#F3EADA'
      bctx.fillRect(0, 0, 64, 64)
      bctx.fillStyle = 'rgba(120, 104, 86, 0.13)'
      bctx.beginPath()
      bctx.arc(32, 32, 9, 0, Math.PI * 2)
      bctx.fill()
      bctx.strokeStyle = 'rgba(120, 104, 86, 0.07)'
      bctx.lineWidth = 2
      bctx.strokeRect(0, 0, 64, 64)
    }
    const boardTex = new THREE.CanvasTexture(boardCanvas)
    boardTex.wrapS = THREE.RepeatWrapping
    boardTex.wrapT = THREE.RepeatWrapping
    boardTex.repeat.set(gw, gh)
    boardTex.colorSpace = THREE.SRGBColorSpace

    const boardGeo = new THREE.BoxGeometry(gw + 1.6, 0.5, gh + 1.6)
    const boardTopMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.92, metalness: 0 })
    const boardSideMat = new THREE.MeshStandardMaterial({ color: '#E7DCCA', roughness: 0.9, metalness: 0 })
    // BoxGeometry 材质顺序：+x, -x, +y, -y, +z, -z
    const board = new THREE.Mesh(boardGeo, [
      boardSideMat,
      boardSideMat,
      boardTopMat,
      boardSideMat,
      boardSideMat,
      boardSideMat
    ])
    board.position.y = -BEAD_H / 2 - 0.26
    scene.add(board)

    // ---------- 珠子 ----------
    const profile = [
      new THREE.Vector2(R_IN, -BEAD_H / 2),
      new THREE.Vector2(R_OUT, -BEAD_H / 2),
      new THREE.Vector2(R_OUT, BEAD_H / 2),
      new THREE.Vector2(R_IN, BEAD_H / 2),
      new THREE.Vector2(R_IN, -BEAD_H / 2)
    ]
    const beadGeo = new THREE.LatheGeometry(profile, 16)
    const beadMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 })
    const mesh = new THREE.InstancedMesh(beadGeo, beadMat, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const dummy = new THREE.Object3D()
    const tint = new THREE.Color()
    const rotSeed: number[] = []
    for (let i = 0; i < count; i++) {
      tint.setHex(colors[i]!)
      mesh.setColorAt(i, tint)
      rotSeed.push((Math.random() - 0.5) * 0.5)
      dummy.position.set(xs[i]!, 0, zs[i]!)
      dummy.rotation.set(0, rotSeed[i]!, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    scene.add(mesh)

    // ---------- 开场：逐行落下 ----------
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const staggerMs = reduceMotion ? 0 : Math.min(14, 900 / Math.max(1, gh))
    const fallMs = reduceMotion ? 0 : 520
    const start = performance.now()
    let animating = !reduceMotion

    // ---------- 渲染循环 ----------
    let raf = 0
    let disposed = false

    const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)

    function frame(): void {
      if (disposed) return
      raf = requestAnimationFrame(frame)

      if (animating) {
        const now = performance.now()
        let allDone = true
        for (let i = 0; i < count; i++) {
          const t0 = start + rows[i]! * staggerMs
          const p = Math.min(1, Math.max(0, (now - t0) / Math.max(1, fallMs)))
          if (p < 1) allDone = false
          const drop = (1 - easeOut(p)) * (span * 0.9 + 6)
          dummy.position.set(xs[i]!, drop, zs[i]!)
          dummy.rotation.set(0, rotSeed[i]!, 0)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
        if (allDone) animating = false
      }

      controls.update()
      renderer.render(scene, camera)
    }

    // ---------- 自适应 ----------
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(host)

    frame()
    loading.value = false

    cleanup = () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      mesh.dispose()
      beadGeo.dispose()
      beadMat.dispose()
      boardGeo.dispose()
      boardTopMat.dispose()
      boardSideMat.dispose()
      boardTex.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }

    // 暴露一个重置视角的小入口给模板
    resetView = (): void => {
      camera.position.set(dist * 0.42, dist * 0.72, dist * 0.62)
      controls.target.set(0, 0, 0)
      controls.update()
    }
    setAutoRotate = (v: boolean): void => {
      controls.autoRotate = v
    }
  } catch (err) {
    loading.value = false
    errorMsg.value = '3D 预览启动失败，可能是浏览器不支持 WebGL2'
    console.error(err)
  }
})

let resetView: () => void = () => {}
let setAutoRotate: (v: boolean) => void = () => {}

function onReset(): void {
  resetView()
}

function toggleRotate(): void {
  autoRotate.value = !autoRotate.value
  setAutoRotate(autoRotate.value)
}

onBeforeUnmount(() => {
  cleanup?.()
  cleanup = null
})
</script>

<template>
  <Modal title="3D 摆件预览" wide @close="emit('close')">
    <div class="scene-3d">
      <div ref="hostEl" class="scene-3d-stage">
        <div v-if="loading" class="scene-3d-hint">正在准备珠子…</div>
        <div v-else-if="errorMsg" class="scene-3d-hint">{{ errorMsg }}</div>
      </div>
      <div class="scene-3d-bar">
        <span class="scene-3d-meta">
          共 <b>{{ beadCount }}</b> 颗豆子 · {{ store.width }}×{{ store.height }}
          <span v-if="tooMany" class="scene-3d-warn">（豆子太多，只渲染前 {{ MAX_BEADS }} 颗）</span>
        </span>
        <div class="scene-3d-actions">
          <button class="btn sm" :class="{ primary: autoRotate }" @click="toggleRotate">
            {{ autoRotate ? '自动旋转中' : '自动旋转' }}
          </button>
          <button class="btn sm" @click="onReset">重置视角</button>
        </div>
      </div>
      <p class="scene-3d-tip">拖动旋转 · 滚轮或双指缩放 · 右键或双指拖动平移</p>
    </div>
  </Modal>
</template>
