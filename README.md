# 拼豆工房 · Bead Atelier

> 一个纯前端的模拟拼豆（Perler Beads）工作台：随心拼、跟图纸拼、把照片变成图纸、把作品导出成 PNG / 工程文件 / 打印清单。
> 无账号、无社交、无后端，所有数据保存在你自己的浏览器里。

![tech](https://img.shields.io/badge/Vue-3-42b883) ![tech](https://img.shields.io/badge/TypeScript-strict-3178c6) ![tech](https://img.shields.io/badge/Canvas-2D-e9a6ae)

在线玩：<https://lin596666.github.io/game-dev/>（手机浏览器打开后可以「添加到主屏幕」，离线也能用）

## 现在能做什么

**画**
- 画笔、橡皮、油漆桶（四连通填充）、吸管取色，笔刷可选 1–4 格
- 直线、空心矩形、实心矩形、空心椭圆、实心椭圆，拖拽时半透明预览
- 对称绘制：左右 / 上下 / 四向镜像，画一边自动补另一边
- 撤销 / 重做（按笔画为一步，只存差异矩形，最多 80 步）
- 框选、复制、剪切、粘贴；整体翻转、旋转 180°、按色替换、裁掉空白边

**跟着图纸拼**
- 跟拼模式：当前颜色高亮、已拼的格子自动打勾、按色标记完成
- 顶部进度条显示已完成颗数 / 总颗数
- **分步引导**：画布上一个圆圈指着"下一颗该拼的豆子"，点一下自动往前走；光标永远指向"下一颗没拼的格子"，跳着拼、撤回、取消勾选都不会错位
- 内置 8 张入门图纸（小爱心、奶油星星、五瓣小花、波点方巾、樱花、猫爪、草莓、云朵），全部程序化生成，不占体积

**外部素材变图纸**
- 导入自己的图片 → 自动按所选色卡量化成拼豆格子，可调尺寸、色数上限、是否抖动

**看效果**
- **3D 摆件预览**：把图纸摆成一盘真珠子，可拖动旋转、缩放、自动旋转，珠子逐行落下（three.js 按需加载，不影响首屏）
- **主画布 2D / 3D 切换**（顶栏或快捷键 `1` / `2`）：3D 视图里可以直接点着拼，支持「熨烫」把珠子压扁看成品效果、旋转回正视角
- 珠子落盘有很轻的合成音效（WebAudio 现合成，零素材），可在侧栏关掉
- 侧栏会记「这次拼了多久」，想知道自己坐了多久不用另开计时器

**成品出图**
- 导出 PNG：每格 8/12/16/20px，可带网格、色号、图例、透明背景、按内容裁边
- 导出工程文件 `.beads.json`（可再次导入，也是唯一的备份手段）
- 导出打印用的色号清单 `.txt`：色号、用量、逐行「从第几格起、连续几颗、什么色」
- **打印图纸**：自动按 A4 切成多页，可调每格 4/5/6/8mm、可选标注色号，浏览器里直接打印或「另存为 PDF」（`Ctrl/Cmd + P`）

**其他**
- 作品自动保存在 IndexedDB，刷新/关页面不丢；作品库可预览缩略图、打开、删除
- 可安装为 PWA（手机桌面图标、离线可用）
- 手机端完整适配：单指画、双指缩放、长按菜单已禁用

## 技术栈

| 层 | 选择 | 为什么 |
| --- | --- | --- |
| 框架 | Vue 3 + Composition API + Pinia | 生态稳定、上手快，长期维护成本低 |
| 语言 | TypeScript（strict） | 网格数据是裸 TypedArray，没有类型约束很容易写错下标 |
| 构建 | Vite | 启动/构建都快，PWA 插件开箱可用 |
| 渲染 | **原生 Canvas 2D 自绘** | 拼豆是规整像素矩阵，用 Konva/Fabric 那种「一个对象一个节点」的库，几千颗豆就会卡；自绘只画视口内的格子，十万格也稳 |
| 存储 | IndexedDB（手写薄封装） | 无后端、容量大、同步读写不受限 |
| 测试 | Vitest | 只测核心算法（网格、历史、量化、工程文件） |

### 一条重要的性能纪律

**画布数据绝不放进框架响应式系统。** 格子数据是 `Uint16Array`，一旦被 `ref`/`reactive` 包一层 Proxy，每次读取都要走代理，几十万格会直接卡死。这里的做法是：

```ts
grid.value = rawGrid        // shallowRef + markRaw
gridVersion.value++         // 用计数器通知视图"变了"
```

撤销栈同样只保存差异矩形（`Patch`），不是整张快照。

## 目录结构

```
src/
├── core/            # 纯逻辑，不依赖 DOM 和框架，可直接单测
│   ├── colors.ts    # 4 套色卡（基础 48 / 糖果 / 莫兰迪 / 自然）、色差匹配
│   ├── grid.ts      # BeadGrid：Uint16Array 网格、画线/填充/椭圆/翻转/裁切
│   ├── history.ts   # 差异快照 + 撤销栈
│   ├── quantize.ts  # 图片 → 拼豆格子（区域平均采样 + 最近色 + Floyd–Steinberg 抖动）
│   ├── pattern.ts   # 用量统计、成本估算、逐行说明书
│   ├── project.ts   # 工程文件序列化（base64 打包 TypedArray）
│   └── library.ts   # 内置入门图纸（程序化生成）
├── renderer/
│   ├── BeadRenderer.ts  # Canvas 2D 渲染器：珠子/平面/图纸三种风格，标尺、色号、进度
│   └── export.ts        # PNG 出图（图例、标尺、裁边）、缩略图
├── storage/db.ts    # IndexedDB 封装
├── store/editor.ts  # Pinia：文档状态、工具状态、撤销、自动保存
├── components/      # 顶栏、工具栏、侧栏、画布舞台、3D 预览、各个弹层
└── styles/main.css  # 日式温馨风格的设计令牌

src-tauri/           # 桌面端外壳（Tauri v2），界面代码一行都不在这里
docs/                # 桌面端打包等说明
scripts/build.mjs    # 构建包装：把 TEMP 指到项目内，绕开 Windows esbuild 报错
scripts/build-mp.mjs # 把 src/core 打成小程序能用的 CommonJS（core/index.js）
miniprogram/         # 微信小程序端（原生小程序，不引 uni-app/Taro）
```

## 微信小程序端

`miniprogram/` 是一套**原生小程序**工程，直接复用 `src/core/` 里的全部纯逻辑（网格、色卡、量化、工程文件、图纸库），只另写了一个更轻的 Canvas 2D 渲染器。

```bash
npm run mp:build   # 把 src/core 用 esbuild 打成 miniprogram/miniprogram/core/index.js
```

然后用「微信开发者工具」打开仓库里的 `miniprogram/` 目录即可预览（`project.config.json` 里用的是 `touristappid`，正式发布时换成你自己的 AppID）。

小程序端有的功能：

- 我的作品（本地缓存，不上传）、8 张内置图纸、新建 29/48/58/72/96 空白图纸
- 画笔 / 橡皮 / 油漆桶 / 吸管，四套色卡横向滑动选色
- 双指捏合缩放、单指绘制、适配视图、色号显示
- 跟拼模式：点一颗珠子就标记已拼，可按颜色只看未拼部分，显示完成百分比
- **相册照片 → 拼豆图纸**：离屏画布逐像素采样，再用与网页版同一套 `quantizeImage` 配珠色
- 导出当前画面到手机相册

小程序没有 IndexedDB，作品存在 `wx.storage`（单 key 1MB、总量 10MB）。一张 96×96 的图纸 base64 后约 36KB，够存两百多张；再多就要换文件系统存储了。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 核心逻辑单测
npm run build      # vue-tsc 类型检查 + 打包，产物在 dist/
npm run preview    # 预览构建产物
```

> `npm run build` 走的是 `scripts/build.mjs` 而不是直接 `vite build`：它会先把
> `TEMP/TMP` 指到项目内的 `.tmp/`，绕开 Windows 上 esbuild 删临时文件被拒绝的报错
> （`[vite:esbuild-transpile] remove ...: Access is denied`）。

桌面端打包见 [docs/desktop.md](docs/desktop.md)。

`dist/` 是纯静态文件，丢到 GitHub Pages / Cloudflare Pages / Vercel 都能直接跑，不需要服务器，也就不涉及域名备案。

## 手机端四条规矩

1. 只用 Pointer Events，不混用 touch/mouse，避免双触发
2. 画布 `touch-action: none`，手势自己接管（浏览器默认滚动会抢走手指）
3. 按 `devicePixelRatio` 放大画布，否则 Retina 屏上珠子边缘发虚
4. 长按菜单、双击缩放要禁用，不然画两笔就弹菜单

## 数据安全提醒

iOS Safari 有一个「7 天不访问就清空网站数据」的策略，IndexedDB 里的作品可能被系统回收。所以：

- 代码里会调用 `navigator.storage.persist()` 申请持久化存储
- **重要作品请用「导出工程文件」备份**，这是唯一可靠的长期保存方式

## 路线图

- [x] 核心绘制、跟拼、图片转图纸、导出
- [x] 分步引导（一颗一颗带新手拼）
- [x] 3D 预览作品摆件效果（three.js 懒加载，不拖慢首屏）
- [x] 桌面端脚手架（Tauri v2，配置已就绪，需本机装 Rust 后才能编译，见 [docs/desktop.md](docs/desktop.md)）
- [x] 微信小程序端（原生小程序，复用 core 逻辑，含图片转图纸）
- [ ] 小程序端在真机/开发者工具里过一遍（本机没有微信开发者工具，目前只做了静态校验与打包自检）
- [ ] 桌面端实际打包出安装包（本机尚无 Rust 工具链）
- [ ] 手机商店上架（Capacitor 7，需要 APP 备案号 + 软著）

## 开发约定

- 主分支 `main`，提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:`）
- 大体积资源（模型、贴图、音效、构建产物）不入库
- `src/core/` 保持零 DOM 依赖，方便单测和将来复用到小程序端

## 声明

色卡中的色值是按屏幕显示近似取的，不代表任何品牌官方色号（如 Perler / Hama 的编号）。实际下单前请对照你买的豆子色卡。
