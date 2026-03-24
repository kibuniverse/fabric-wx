Page({
  data: {
    nickName: '',
    statusBarHeight: 44,
    navBarHeight: 88,
    inputTop: 0,
    cursor: -1,
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const systemInfo = wx.getWindowInfo();
    const statusBarHeight = systemInfo.statusBarHeight || 44;

    // container 的 padding-top = 导航栏高度，让内容从导航栏下方开始
    // 然后用 CSS margin-top: 24px 让输入框与标题保持 24px 间距
    const navBarHeight = statusBarHeight + 44;
    const inputTop = navBarHeight;

    const nickName = userInfo.nickName || '';
    this.setData({
      nickName,
      statusBarHeight,
      navBarHeight: statusBarHeight + 44,
      inputTop,
    });
  },

  onInputFocus() {
    const len = this.data.nickName.length;
    if (len > 0) {
      this.setData({
        cursor: len,
      });
      // 短暂延迟后恢复正常模式
      setTimeout(() => {
        this.setData({
          cursor: -1,
        });
      }, 50);
    }
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

    // 检查是否包含空格
    if (/\s/.test(newNickName)) {
      wx.showToast({ title: '用户名不能包含空格', icon: 'none' });
      return;
    }

    // 检查长度（trim后再检查，因为用户可能输入全为空格）
    if (newNickName.length > 20) {
      wx.showToast({ title: '用户名不能超过20个字符', icon: 'none' });
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