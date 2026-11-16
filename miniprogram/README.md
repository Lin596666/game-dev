# 拼豆工房 · 微信小程序端

原生小程序工程，**没有**用 uni-app / Taro —— 只为了少一层工具链。核心逻辑（网格、色卡、图片量化、工程文件、图纸库）全部来自仓库根目录的 `src/core/`，用 esbuild 打成一份 CommonJS 放进 `miniprogram/core/index.js`。

## 怎么跑起来

1. 在仓库根目录执行一次打包（改了 `src/core/*` 之后都要重跑）：

   ```bash
   npm run mp:build
   ```

2. 打开「微信开发者工具」→ 导入项目 → 目录选仓库里的 `miniprogram/` 文件夹。
3. `project.config.json` 里 AppID 目前是 `touristappid`（游客态，只能在开发者工具里跑）。要真机预览或者发布，换成你自己的小程序 AppID。

## 目录

```
miniprogram/
├── project.config.json     # 项目配置（miniprogramRoot 指向 miniprogram/）
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── core/index.js       # 构建产物：src/core 的 CommonJS 打包（不要手改）
│   ├── utils/db.js         # 作品存储（wx.storage）
│   ├── utils/render.js     # 简化版 Canvas 2D 渲染器
│   └── pages/
│       ├── index/          # 首页：我的作品、内置图纸、新建、图片转图纸
│       └── editor/         # 编辑器：画笔/橡皮/油漆桶/吸管、跟拼、缩放、导出
```

## 和网页版的差异

| | 网页版 | 小程序端 |
| --- | --- | --- |
| 存储 | IndexedDB | `wx.storage`（单 key 1MB / 总量 10MB） |
| 渲染 | 珠子有高光、孔洞、三种显示风格 | 纯色方块，只画视口内的格子（小程序性能更紧） |
| 导出 | PNG（可带网格/色号/图例/裁边）、工程文件、清单 | 当前画面存相册 |
| 图片转图纸 | 可调尺寸/色数/色卡/抖动 | 选定尺寸后自动配 14 色以内 |
| 3D 预览 | 有（three.js 懒加载） | 无 |

## 已知待办

- 还没在真机上跑过（本机没有微信开发者工具），目前只做了 `node --check` 语法校验和打包自检
- 小程序端还没有：形状工具（直线/矩形/椭圆）、撤销步数上限调整、色号清单导出
