Page({
  data: {
    url: ''
  },

  onLoad(options: any) {
    const { type, title } = options;

    // 设置页面标题
    wx.setNavigationBarTitle({
      title: title || '详情'
    });

    // 根据 type 设置不同的 URL
    // TODO: 替换为实际的协议地址
    let url = '';
    if (type === 'userAgreement') {
      url = 'https://your-domain.com/user-agreement.html';
    } else if (type === 'privacyPolicy') {
      url = 'https://your-domain.com/privacy-policy.html';
    }

    this.setData({ url });
  },

  onShow() {}
})