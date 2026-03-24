Page({
  data: {
    zhizhiId: '',
    originalZhizhiId: '',
    cursor: -1,
    hasModified: false,
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const zhizhiId = userInfo.zhizhiId || '';
    // 检查是否已经修改过ID
    const hasModified = userInfo.zhizhiIdModified || false;

    this.setData({
      zhizhiId,
      originalZhizhiId: zhizhiId,
      hasModified,
    });
  },

  onInputFocus() {
    const len = this.data.zhizhiId.length;
    if (len > 0) {
      this.setData({
        cursor: len,
      });
      setTimeout(() => {
        this.setData({
          cursor: -1,
        });
      }, 50);
    }
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({
      zhizhiId: e.detail.value,
    });
  },

  async onSave() {
    const newId = this.data.zhizhiId.trim();

    // 验证输入
    if (!newId) {
      wx.showToast({ title: '请输入知织ID', icon: 'none' });
      return;
    }

    // 检查是否包含空格
    if (/\s/.test(newId)) {
      wx.showToast({ title: '知织ID不能包含空格', icon: 'none' });
      return;
    }

    // 检查长度
    if (newId.length < 4) {
      wx.showToast({ title: '知织ID最少为4个字符', icon: 'none' });
      return;
    }

    if (newId.length > 20) {
      wx.showToast({ title: '知织ID最多为20个字符', icon: 'none' });
      return;
    }

    // 检查是否包含禁止字符
    // 仅支持中文、英文字母、数字、下划线
    const allowedPattern = /^[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaffa-zA-Z0-9_]+$/;
    if (!allowedPattern.test(newId)) {
      wx.showToast({ title: '仅支持中文、字母、数字、下划线', icon: 'none' });
      return;
    }

    // 检查是否有修改
    if (newId === this.data.originalZhizhiId) {
      wx.showToast({ title: '未做修改', icon: 'none' });
      return;
    }

    // 检查是否已经修改过
    if (this.data.hasModified) {
      wx.showToast({ title: '知织ID仅允许修改一次', icon: 'none' });
      return;
    }

    // 弹窗确认
    wx.showModal({
      title: '确认修改',
      content: `是否确认要将知织ID修改为「${newId}」？\n\n知织ID只能修改一次，请谨慎操作。`,
      confirmText: '确认修改',
      confirmColor: '#333333',
      success: (res) => {
        if (res.confirm) {
          this.doSave(newId);
        }
      },
    });
  },

  async doSave(newId: string) {
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      // 保存旧的知织ID用于回滚
      const userInfo = wx.getStorageSync('userInfo') || {};
      const oldZhizhiId = userInfo.zhizhiId;
      const oldZhizhiIdModified = userInfo.zhizhiIdModified;

      // 先更新本地
      userInfo.zhizhiId = newId;
      userInfo.zhizhiIdModified = true;
      wx.setStorageSync('userInfo', userInfo);

      // 同步到云端
      const app = getApp<IAppOption>();
      if (app) {
        const syncSuccess = await app.syncToCloud(0);
        if (!syncSuccess) {
          // 云端同步失败，回滚本地
          userInfo.zhizhiId = oldZhizhiId;
          userInfo.zhizhiIdModified = oldZhizhiIdModified;
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
      console.error('保存知织ID失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },
});