/// 桌面端入口。
///
/// 界面完全复用 Web 版（Vite 构建后的 dist），这里只负责开一个原生窗口。
/// 之所以不做前后端分离，是因为拼豆应用的数据全部在 IndexedDB 里，
/// 不需要任何 Rust 侧命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动拼豆工房失败");
}
