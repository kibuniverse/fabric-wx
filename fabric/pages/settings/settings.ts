Page({
  data: {
    version: ''
  },

  onLoad() {
    // 获取小程序版本号
    try {
      const accountInfo = wx.getAccountInfoSync();
      this.setData({
        version: accountInfo.miniProgram.version || '1.0.0'
      });
    } catch (e) {
      // 开发环境可能获取不到，使用默认值
      this.setData({
        version: '1.0.0'
      });
    }
  },

  onShow() {},

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/settings/settings',
      imageUrl: '/assets/share.png'
    }
  }
})
