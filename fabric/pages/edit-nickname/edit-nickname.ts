Page({
  data: {
    nickName: '',
    statusBarHeight: 44,
    navBarHeight: 88,
    inputTop: 0,
    inputFocus: false,
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const systemInfo = wx.getWindowInfo();
    const statusBarHeight = systemInfo.statusBarHeight || 44;

    // container 的 padding-top = 导航栏高度，让内容从导航栏下方开始
    // 然后用 CSS margin-top: 24px 让输入框与标题保持 24px 间距
    const navBarHeight = statusBarHeight + 44;
    const inputTop = navBarHeight;

    this.setData({
      nickName: userInfo.nickName || '',
      statusBarHeight,
      navBarHeight: statusBarHeight + 44,
      inputTop,
      inputFocus: true,
    });
  },

  onBack() {
    wx.navigateBack();
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