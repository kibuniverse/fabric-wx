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
    // settings 不是 tabBar 页面，不需要设置 selected
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/settings/settings',
      imageUrl: '/assets/share.png'
    }
  }
})
