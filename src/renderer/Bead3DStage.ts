/**
 * 3D 拼豆舞台：把整张图纸摆成一盘真珠子，可以转着看，也可以直接在上面点着拼。
 *
 * 和 3D 预览弹层的区别：那里只是"看一眼"，这里是真正可编辑的视图，
 * 所以一次只建一组 InstancedMesh（所有珠子共用一个几何体），
 * 改一次颜色只更新实例缓冲，不重建场景。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { colorById } from '@/core/colors'
import { finishById, type IronFinishId } from '@/core/iron'
import type { BeadGrid } from '@/core/grid'

/** 珠子外径 / 内孔半径 / 高度，单位是"一格 = 1" */
const R_OUT = 0.44
const R_IN = 0.19
const BEAD_H = 0.2

export interface Stage3DCallbacks {
  /** 单击某个格子（拖动旋转不会触发） */
  onClick?: (x: number, y: number) => void
  /** 鼠标悬停到哪个格子 */
  onHover?: (cell: { x: number; y: number } | null) => void
}

export class Bead3DStage {
  private host: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private board: THREE.Mesh | null = null
  private beads: THREE.InstancedMesh | null = null
  private hover: THREE.Mesh
  private dummy = new THREE.Object3D()
  private colorCache = new Map<number, THREE.Color>()
  private geometry: THREE.BufferGeometry
  private material: THREE.MeshStandardMaterial
  private resizeObserver: ResizeObserver
  private frame = 0
  private grid: BeadGrid | null = null
  private cb: Stage3DCallbacks
  private downAt = 0
  private downPos = { x: 0, y: 0 }
  private moved = false
  private disposed = false
  /** InstancedMesh 预先开好的实例上限，图纸尺寸变了才重建 */
  private capacity = 0
  /** 熨烫模式：珠子被压扁，看起来像成品 */
  private finishId: IronFinishId = 'raw'
  private flatten = 1
  private keyLight!: THREE.DirectionalLight

  constructor(host: HTMLElement, cb: Stage3DCallbacks = {}) {
    this.host = host
    this.cb = cb

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#F3EDE3')
    this.scene.fog = new THREE.Fog('#F3EDE3', 30, 90)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400)
    this.camera.position.set(0, 14, 18)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 5
    this.controls.maxDistance = 90
    this.controls.autoRotateSpeed = 0.8

    // 珠子：车一个闭合垫圈（外壁 + 上下环面 + 内孔），比纯圆柱更像真豆子
    const h = BEAD_H
    const profile = [
      new THREE.Vector2(R_IN, -h / 2),
      new THREE.Vector2(R_OUT - 0.05, -h / 2),
      new THREE.Vector2(R_OUT, -h / 2 + 0.05),
      new THREE.Vector2(R_OUT, h / 2 - 0.05),
      new THREE.Vector2(R_OUT - 0.05, h / 2),
      new THREE.Vector2(R_IN, h / 2),
      new THREE.Vector2(R_IN, -h / 2)
    ]
    this.geometry = new THREE.LatheGeometry(profile, 14)
    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.42,
      metalness: 0.02,
      flatShading: false
    })

    // 光：天光打底 + 主光投影 + 一点补光，珠子的高光才不脏
    const hemi = new THREE.HemisphereLight('#FFFDF8', '#C9BCA8', 1.5)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight('#FFF6E9', 1.9)
    key.position.set(10, 18, 8)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 80
    key.shadow.bias = -0.0012
    this.scene.add(key)
    this.keyLight = key

    const fill = new THREE.DirectionalLight('#EAF2FF', 0.5)
    fill.position.set(-12, 8, -10)
    this.scene.add(fill)

    // 悬停高亮框
    this.hover = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#C97B5A', transparent: true, opacity: 0.28, depthWrite: false })
    )
    this.hover.rotation.x = -Math.PI / 2
    this.hover.position.y = BEAD_H + 0.02
    this.hover.visible = false
    this.scene.add(this.hover)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointerleave', this.onPointerLeave)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()

    this.loop()
  }

  setGrid(grid: BeadGrid): void {
    this.grid = grid
    this.rebuildBoard()
    this.rebuildBeads()
    this.resetView()
  }

  /** 只重刷珠子，不重建场景（画一笔就调一次） */
  refresh(): void {
    this.rebuildBeads()
  }

  private rebuildBoard(): void {
    const g = this.grid
    if (!g) return
    if (this.board) {
      this.scene.remove(this.board)
      this.board.geometry.dispose()
      const old = this.board.material
      const list = Array.isArray(old) ? old : [old]
      for (const m of list) {
        if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose()
        m.dispose()
      }
      this.board = null
    }

    // 底板贴图：每格一个小孔，每 10 格一条深一点的线
    const scale = 16
    const canvas = document.createElement('canvas')
    canvas.width = g.width * scale
    canvas.height = g.height * scale
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#FBF7F1'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (let y = 0; y < g.height; y++) {
        for (let x = 0; x < g.width; x++) {
          ctx.strokeStyle = 'rgba(58,52,46,0.10)'
          ctx.lineWidth = 1
          ctx.strokeRect(x * scale + 0.5, y * scale + 0.5, scale, scale)
          ctx.beginPath()
          ctx.fillStyle = 'rgba(58,52,46,0.10)'
          ctx.arc(x * scale + scale / 2, y * scale + scale / 2, scale * 0.12, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.strokeStyle = 'rgba(58,52,46,0.26)'
      ctx.lineWidth = 2
      for (let x = 0; x <= g.width; x += 10) {
        ctx.beginPath()
        ctx.moveTo(x * scale, 0)
        ctx.lineTo(x * scale, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y <= g.height; y += 10) {
        ctx.beginPath()
        ctx.moveTo(0, y * scale)
        ctx.lineTo(canvas.width, y * scale)
        ctx.stroke()
      }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4

    const geo = new THREE.BoxGeometry(g.width + 0.6, 0.5, g.height + 0.6)
    const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 })
    const side = new THREE.MeshStandardMaterial({ color: '#E7DCCB', roughness: 0.95 })
    const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side])
    mesh.position.set(0, -0.25, 0)
    mesh.receiveShadow = true
    this.scene.add(mesh)
    this.board = mesh

    // 阴影范围跟着图纸大小走，否则大图阴影会被裁掉
    const reach = Math.max(g.width, g.height) * 0.75 + 4
    const cam = this.keyLight.shadow.camera
    cam.left = -reach
    cam.right = reach
    cam.top = reach
    cam.bottom = -reach
    cam.updateProjectionMatrix()
    this.keyLight.position.set(reach * 0.8, reach * 1.4, reach * 0.6)
  }

  private rebuildBeads(): void {
    const g = this.grid
    if (!g) return

    const total = g.width * g.height
    if (this.beads && this.capacity < total) {
      this.scene.remove(this.beads)
      this.beads.dispose()
      this.beads = null
    }
    if (!this.beads) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, total)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      this.scene.add(mesh)
      this.beads = mesh
      this.capacity = total
    }

    const beads = this.beads
    let n = 0
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const id = g.data[y * g.width + x]
        if (!id) continue
        this.dummy.position.set(
          x - g.width / 2 + 0.5,
          (BEAD_H * this.flatten) / 2,
          y - g.height / 2 + 0.5
        )
        this.dummy.scale.set(1, this.flatten, 1)
        this.dummy.updateMatrix()
        beads.setMatrixAt(n, this.dummy.matrix)
        beads.setColorAt(n, this.colorOf(id))
        n++
      }
    }
    beads.count = n
    beads.instanceMatrix.needsUpdate = true
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true

    // 珠子少的时候开阴影，多了就关掉——三万颗的阴影没必要，还掉帧
    this.renderer.shadowMap.enabled = n <= 12000
  }

  private colorOf(id: number): THREE.Color {
    let c = this.colorCache.get(id)
    if (!c) {
      const info = colorById(id)
      c = new THREE.Color(info?.hex ?? '#DDDDDD')
      this.colorCache.set(id, c)
    }
    return c
  }

  private pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const g = this.grid
    if (!g || !this.board) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.board, false)[0]
    if (!hit) return null
    const x = Math.floor(hit.point.x + g.width / 2)
    const y = Math.floor(hit.point.z + g.height / 2)
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null
    return { x, y }
  }

  private onPointerDown = (ev: PointerEvent): void => {
    this.downAt = performance.now()
    this.downPos = { x: ev.clientX, y: ev.clientY }
    this.moved = false
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (Math.hypot(ev.clientX - this.downPos.x, ev.clientY - this.downPos.y) > 6) this.moved = true
    const cell = this.pickCell(ev.clientX, ev.clientY)
    if (cell) {
      this.hover.visible = true
      this.hover.position.x = cell.x - this.grid!.width / 2 + 0.5
      this.hover.position.z = cell.y - this.grid!.height / 2 + 0.5
    } else {
      this.hover.visible = false
    }
    this.cb.onHover?.(cell)
  }

  private onPointerUp = (ev: PointerEvent): void => {
    if (this.moved || performance.now() - this.downAt > 450) return
    const cell = this.pickCell(ev.clientX, ev.clientY)
    if (cell) this.cb.onClick?.(cell.x, cell.y)
  }

  private onPointerLeave = (): void => {
    this.hover.visible = false
    this.cb.onHover?.(null)
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on
  }

  /** 烫法：把珠子按 finished 的比例压扁、调材质，看成品效果 */
  setFinish(id: IronFinishId): void {
    const f = finishById(id)
    if (this.finishId === id) return
    this.finishId = id
    this.flatten = f.flatten
    this.material.roughness = f.roughness
    this.material.metalness = f.sparkle > 0 ? 0.12 : 0.02
    this.hover.position.y = BEAD_H * f.flatten + 0.02
    this.rebuildBeads()
  }

  resetView(): void {
    const g = this.grid
    if (!g) return
    const span = Math.max(g.width, g.height)
    const dist = span * 0.92 + 7
    this.camera.position.set(0, dist * 0.78, dist * 0.92)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  resize(): void {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop = (): void => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    if (this.beads) {
      this.scene.remove(this.beads)
      this.beads.dispose()
    }
    if (this.board) {
      this.scene.remove(this.board)
      this.board.geometry.dispose()
      const old = this.board.material
      const list = Array.isArray(old) ? old : [old]
      for (const m of list) {
        if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose()
        m.dispose()
      }
    }
    this.geometry.dispose()
    this.material.dispose()
    this.hover.geometry.dispose()
    ;(this.hover.material as THREE.Material).dispose()
    this.renderer.dispose()
    if (el.parentElement === this.host) this.host.removeChild(el)
  }
}
