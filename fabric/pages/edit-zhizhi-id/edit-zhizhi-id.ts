Page({
  data: {
    zhizhiId: '',
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      zhizhiId: userInfo.zhizhiId || '',
    });
  },

  onCopyId() {
    wx.setClipboardData({
      data: this.data.zhizhiId,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },
});