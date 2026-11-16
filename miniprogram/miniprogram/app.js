App({
  globalData: {
    /** 画布尺寸等全局配置，先留空，后续需要跨页共享时再用 */
  },

  onLaunch() {
    // 记住本机上次用的色卡，打开编辑器时接着用
    const lastSet = wx.getStorageSync('bead:lastSet')
    if (lastSet) this.globalData.lastSet = lastSet
  }
})
