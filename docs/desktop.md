# 桌面端（Tauri v2）

Web 版能直接用，桌面端只是「同一个页面套一个原生窗口」，好处是：

- 双击就能用，不用开浏览器、不用记网址；
- 数据在系统里更稳（不会被浏览器"7 天没访问就清 IndexedDB"清掉）；
- 以后想上架也能打包成安装包。

## 本机需要什么

| 依赖 | 说明 |
| --- | --- |
| Node 20+ | 已经有（v26） |
| Rust（stable，1.77+） | **本机尚未安装**，见下方 |
| Microsoft C++ 生成工具 | 装 Visual Studio Build Tools 时勾选「使用 C++ 的桌面开发」 |

Windows 安装 Rust 最省事的方式：

```powershell
winget install Rustlang.Rustup
# 装完后重开终端，确认：
rustc -V
cargo -V
```

## 第一次运行

```bash
# 1. 装 Tauri CLI（只装一次）
npm i -D @tauri-apps/cli@^2 --registry=https://registry.npmmirror.com

# 2. 用项目图标生成全套图标（只需要跑一次，产物在 src-tauri/icons/）
npm run tauri:icon

# 3. 开发模式：自动起 Vite + 原生窗口，改代码会热更新
npm run tauri:dev

# 4. 打安装包（.msi / .exe）
npm run tauri:build
```

> 第 2 步必须做：`src-tauri/tauri.conf.json` 里 `bundle.icon` 指向那些图标文件，
> 文件不存在时 `tauri build` 会直接报错。图标源文件是 `public/bead.svg`。

产物位置：`src-tauri/target/release/bundle/`。

## 目录说明

```
src-tauri/
  Cargo.toml            Rust 依赖（tauri 2）
  build.rs              编译期生成 context
  tauri.conf.json       窗口大小、标题、打包信息、dev/build 命令
  capabilities/         权限清单（这里只要 core:default，没有额外系统权限）
  src/main.rs           程序入口
  src/lib.rs            只做一件事：开窗口
  icons/                打包图标（由 npm run tauri:icon 生成，未提交）
```

界面代码一行都不在 `src-tauri` 里，全在 `src/`——桌面版和网页版共用。

## 为什么不在这里写 Rust 逻辑

拼豆应用的所有数据都在浏览器的 IndexedDB 里，读写文件用的是浏览器下载/上传。
没有需要原生能力的地方，所以不需要自定义命令（command），也不需要插件。
真要加"保存到本地任意目录"之类的能力，再引入 `tauri-plugin-dialog` + `tauri-plugin-fs` 并在这里注册。

## 和手机端的关系

Tauri v2 已经支持 iOS / Android，但手机端更省事的路线还是：

1. **现在**：网页版加 PWA，用户「添加到主屏幕」，体验接近 App；
2. **要上架时**：用 Capacitor 7 包一层，复用同一份 `dist/`；
3. 国内 Android 商店上架需要**软著 + APP 备案号**，这块提前准备。
