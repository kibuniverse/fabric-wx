Page({
  data: {
    // 页面数据
  },

  onLoad() {
    // 页面加载时执行
  },

  onShow() {
    if (typeof this.getTabBar === 'function' &&
      this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1  // library 是第二个标签
      })
    }
  }
})
