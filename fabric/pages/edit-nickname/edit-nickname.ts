Page({
  data: {
    nickName: '',
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      nickName: userInfo.nickName || '',
    });
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({
      nickName: e.detail.value,
    });
  },

  async onSave() {
    const newNickName = this.data.nickName.trim();
    if (!newNickName) {
      wx.showToast({ title: '请输入用户名', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const userInfo = wx.getStorageSync('userInfo') || {};
      userInfo.nickName = newNickName;
      wx.setStorageSync('userInfo', userInfo);

      const app = getApp<IAppOption>();
      if (app) {
        await app.syncToCloud(0);
      }

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 500);
    } catch (error) {
      console.error('保存用户名失败:', error);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});