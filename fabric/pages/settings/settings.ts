Page({
  data: {
    // 页面数据
    settings: [
      {
        title: '账号设置',
        icon: 'user'
      },
      {
        title: '通知设置',
        icon: 'notification'
      },
      {
        title: '关于我们',
        icon: 'info'
      }
    ]
  },

  onLoad() {
    // 页面加载时执行
  },

  onShow() {
    if (typeof this.getTabBar === 'function' &&
      this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3  // settings 是第四个标签
      })
    }
  }
})
