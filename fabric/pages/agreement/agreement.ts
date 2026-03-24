// pages/agreement/agreement.ts

Page({
  data: {
    type: 'userAgreement' as 'userAgreement' | 'privacyPolicy'
  },

  onLoad(options: any) {
    const { type } = options;
    if (type === 'privacyPolicy') {
      wx.setNavigationBarTitle({ title: '隐私政策' });
      this.setData({ type: 'privacyPolicy' });
    } else {
      wx.setNavigationBarTitle({ title: '用户协议' });
      this.setData({ type: 'userAgreement' });
    }
  },

  onShow() {}
});