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

    // 检查是否包含空格
    if (/\s/.test(newNickName)) {
      wx.showToast({ title: '用户名不能包含空格', icon: 'none' });
      return;
    }

    // 检查是否包含禁止字符
    // 允许：中文（含繁体）、英文字母、数字、下划线、中间点（·）
    const allowedPattern = /^[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaffa-zA-Z0-9_·]+$/;
    if (!allowedPattern.test(newNickName)) {
      wx.showToast({ title: '用户名仅支持中文、字母、数字、下划线和·', icon: 'none' });
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