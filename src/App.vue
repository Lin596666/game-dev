<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BeadGrid } from '@/core/grid'
import { LIBRARY } from '@/core/library'
import { fitToColors } from '@/core/palette'
import { decodeShare, shareCodeFromUrl } from '@/core/share'
import { useEditorStore, type ToolId } from '@/store/editor'
import TopBar from './components/TopBar.vue'
import ToolRail from './components/ToolRail.vue'
import CanvasStage from './components/CanvasStage.vue'
import SidePanel from './components/SidePanel.vue'
import NewProjectModal from './components/NewProjectModal.vue'
import LibraryModal from './components/LibraryModal.vue'
import ProjectsModal from './components/ProjectsModal.vue'
import WallModal from './components/WallModal.vue'
import ImportImageModal from './components/ImportImageModal.vue'
import ExportModal from './components/ExportModal.vue'
import PrintModal from './components/PrintModal.vue'
import StockModal from './components/StockModal.vue'
import ShareModal from './components/ShareModal.vue'

// 3D 预览整块按需加载，three.js 只在真正打开时才下载
const Scene3DModal = defineAsyncComponent(() => import('./components/Scene3DModal.vue'))
const IronModal = defineAsyncComponent(() => import('./components/IronModal.vue'))
// 3D 编辑视图同理：three.js 的 chunk 只在切到 3D 时下载
const Stage3D = defineAsyncComponent(() => import('./components/Stage3D.vue'))

const store = useEditorStore()

const view = ref<'2d' | '3d'>('2d')
const showNew = ref(false)
const showLibrary = ref(false)
const showProjects = ref(false)
const showWall = ref(false)
const showImport = ref(false)
const showExport = ref(false)
const showPrint = ref(false)
const showStock = ref(false)
const showShare = ref(false)
const showScene3D = ref(false)
const showIron = ref(false)
const panelOpen = ref(false)

const toastText = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function toast(text: string): void {
  toastText.value = text
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastText.value = ''), 2200)
}

function closeAll(): void {
  showNew.value = false
  showLibrary.value = false
  showProjects.value = false
  showWall.value = false
  showImport.value = false
  showExport.value = false
  showPrint.value = false
  showStock.value = false
  showShare.value = false
  showScene3D.value = false
  showIron.value = false
}

function createProject(payload: { name: string; width: number; height: number }): void {
  store.newProject(payload.name, payload.width, payload.height)
  showNew.value = false
  toast(`已新建 ${payload.width}×${payload.height} 图纸`)
}

function pickLibrary(id: string): void {
  const pattern = LIBRARY.find((p) => p.id === id)
  if (!pattern) return
  store.docName = pattern.name
  store.loadGrid(pattern.build(), { newId: true, keepName: true })
  showLibrary.value = false
  toast(`已打开图纸：${pattern.name}`)
}

async function openProject(id: string): Promise<void> {
  const ok = await store.openProject(id)
  showProjects.value = false
  showWall.value = false
  toast(ok ? '已打开' : '打开失败，文件可能损坏')
}

function applyImport(payload: { width: number; height: number; data: Uint16Array }): void {
  const grid = new BeadGrid(payload.width, payload.height, payload.data)
  let note = ''
  // 用户标了"我有的色号"就顺手把图换成买得到的颜色，省得拼一半发现缺色
  if (store.hasOwnedList) {
    const res = fitToColors(grid, store.ownedColors)
    if (res.changed > 0) note = `，${res.changed} 格换成了你有的色号`
  }
  store.loadGrid(grid, { newId: true, keepName: true })
  showImport.value = false
  toast(`已转换 ${payload.width}×${payload.height} 图纸${note}`)
}

function onKey(e: KeyboardEvent): void {
  const el = e.target as HTMLElement | null
  if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return
  const meta = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()

  if (meta && k === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
    return
  }
  if (meta && k === 'y') {
    e.preventDefault()
    store.redo()
    return
  }
  // Ctrl+P 不要直接打印整个界面，先把图纸排版好
  if (meta && k === 'p') {
    e.preventDefault()
    showPrint.value = true
    return
  }
  if (meta && k === 'c') {
    if (store.copySelection()) toast('已复制选区')
    return
  }
  if (meta && k === 'x') {
    if (store.cutSelection()) toast('已剪切选区')
    return
  }
  if (meta && k === 'v') {
    store.pasteSelection()
    toast('已粘贴')
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.selection) {
      store.cutSelection()
      toast('已删除选区')
    }
    return
  }
  if (e.key === 'Escape') {
    closeAll()
    return
  }
  // 1 / 2 直接切 2D、3D 视图
  if (k === '1' && !meta) {
    view.value = '2d'
    return
  }
  if (k === '2' && !meta) {
    view.value = '3d'
    return
  }
  const toolKeys: Record<string, ToolId> = {
    b: 'pencil',
    e: 'eraser',
    g: 'bucket',
    i: 'eyedropper',
    l: 'line',
    r: 'rect',
    o: 'ellipse',
    m: 'select'
  }
  const t = toolKeys[k]
  if (t && !meta) store.tool = t
}

// 久坐提醒：到点弹一句，提醒过就清掉标记，下一轮再说
watch(
  () => store.restDue,
  (due) => {
    if (!due) return
    toast('坐了有点久，起来走两步、看看远处 🌿')
    store.ackRest()
  }
)

// 里程碑：拼到 1/4、1/2、3/4、完成时给一句鼓励
watch(
  () => store.milestone,
  (msg) => {
    if (!msg) return
    toast(msg)
    store.milestone = ''
  }
)

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  store.startClock()
  void store.ensurePersist()

  // 链接里带分享码（#p=b1.…）就直接打开那张图纸，不再读本机最近作品
  const shared = shareCodeFromUrl(location.hash)
  if (shared) {
    try {
      const payload = decodeShare(shared)
      store.docName = '来自分享的图纸'
      store.loadGrid(new BeadGrid(payload.width, payload.height, payload.cells), {
        newId: true,
        keepName: true
      })
      // 清掉 hash：刷新页面时不要再导入一次
      history.replaceState(null, '', location.pathname + location.search)
      toast(`已打开朋友分享的 ${payload.width}×${payload.height} 图纸`)
      return
    } catch {
      toast('分享链接里的图纸解析失败了')
    }
  }

  const list = await store.listAll()
  if (list.length > 0) {
    await store.openProject(list[0]!.id)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  store.stopClock()
})
</script>

<template>
  <div class="app">
    <TopBar
      :view="view"
      @view="view = $event"
      @new="showNew = true"
      @library="showLibrary = true"
      @projects="showProjects = true"
      @wall="showWall = true"
      @import-image="showImport = true"
      @export-panel="showExport = true"
      @print="showPrint = true"
      @scene3d="showScene3D = true"
      @iron="showIron = true"
      @toggle-panel="panelOpen = !panelOpen"
    />

    <div class="app-body">
      <ToolRail />
      <CanvasStage v-if="view === '2d'" />
      <Suspense v-else>
        <Stage3D />
        <template #fallback>
          <div class="stage stage-loading">
            <span class="muted">正在搬出三维盘子…</span>
          </div>
        </template>
      </Suspense>
      <SidePanel :class="{ open: panelOpen }" @stock="showStock = true" />
    </div>

    <NewProjectModal v-if="showNew" @close="showNew = false" @create="createProject" />
    <LibraryModal v-if="showLibrary" @close="showLibrary = false" @pick="pickLibrary" />
    <ProjectsModal v-if="showProjects" @close="showProjects = false" @open="openProject" />
    <WallModal v-if="showWall" @close="showWall = false" @open="openProject" />
    <ImportImageModal v-if="showImport" @close="showImport = false" @apply="applyImport" />
    <ExportModal
      v-if="showExport"
      @close="showExport = false"
      @share="
        showExport = false;
        showShare = true
      "
    />
    <ShareModal v-if="showShare" @close="showShare = false" />
    <PrintModal v-if="showPrint" @close="showPrint = false" />
    <StockModal v-if="showStock" @close="showStock = false" />
    <Scene3DModal v-if="showScene3D" @close="showScene3D = false" />
    <IronModal v-if="showIron" @close="showIron = false" @saved="store.persist()" />

    <div v-if="toastText" class="toast">{{ toastText }}</div>
  </div>
</template>
