Page({
  data: {
    nickName: '',
    cursor: -1,
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const nickName = userInfo.nickName || '';
    this.setData({ nickName });
  },

  onInputFocus() {
    const len = this.data.nickName.length;
    if (len > 0) {
      this.setData({ cursor: len });
      setTimeout(() => {
        this.setData({ cursor: -1 });
      }, 50);
    }
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ nickName: e.detail.value });
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

    // 检查长度
    if (newNickName.length > 20) {
      wx.showToast({ title: '用户名不能超过20个字符', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });

    try {
      // 保存旧的昵称用于回滚
      const userInfo = wx.getStorageSync('userInfo') || {};
      const oldNickName = userInfo.nickName;

      // 先更新本地存储
      userInfo.nickName = newNickName;
      wx.setStorageSync('userInfo', userInfo);

      // 同步到云端
      const app = getApp<IAppOption>();
      if (app) {
        const syncSuccess = await app.syncToCloud(0);
        if (!syncSuccess) {
          // 云端同步失败，回滚本地存储
          userInfo.nickName = oldNickName;
          wx.setStorageSync('userInfo', userInfo);
          wx.hideLoading();
          wx.showToast({ title: '网络异常，保存失败', icon: 'none' });
          return;
        }
      }

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 500);
    } catch (error) {
      console.error('保存用户名失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});