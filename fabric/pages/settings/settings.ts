// pages/settings/settings.ts

// 本地头像存储 key
const LOCAL_AVATAR_PATH_KEY = 'local_avatar_path';
const LOCAL_AVATAR_FILE_ID_KEY = 'local_avatar_file_id';

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

  /**
   * 清除本地头像存储
   */
  clearLocalAvatar() {
    const localPath = wx.getStorageSync(LOCAL_AVATAR_PATH_KEY);
    if (localPath) {
      try {
        wx.getFileSystemManager().unlinkSync(localPath);
      } catch (e) {
        console.warn('删除本地头像文件失败:', e);
      }
    }
    wx.removeStorageSync(LOCAL_AVATAR_PATH_KEY);
    wx.removeStorageSync(LOCAL_AVATAR_FILE_ID_KEY);
  },

  /**
   * 个人资料修改
   */
  onEditProfile() {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  /**
   * 注销账号
   */
  onDeleteAccount() {
    wx.showModal({
      title: '请你确认是否注销账户',
      content: '注销将删除所有线上数据，不可恢复',
      confirmText: '确认注销',
      cancelText: '我再想想',
      confirmColor: '#B22222',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在注销...', mask: true });
          try {
            // 调用云函数删除用户数据
            const result = await wx.cloud.callFunction({
              name: 'deleteUser',
            }) as any;

            wx.hideLoading();

            if (result.result && result.result.success) {
              // 清除账号相关的本地缓存
              wx.removeStorageSync('userInfo');
              wx.removeStorageSync('total_zhizhi_time');
              // 清除本地头像文件
              this.clearLocalAvatar();

              wx.showToast({ title: '账号已注销', icon: 'success' });

              // 延迟跳转到 me 页面
              setTimeout(() => {
                wx.switchTab({ url: '/pages/me/me' });
              }, 1500);
            } else {
              wx.showToast({
                title: result.result?.error || '注销失败，请重试',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('注销账号失败:', error);
            wx.showToast({ title: '注销失败，请重试', icon: 'none' });
          }
        }
      }
    });
  },

  /**
   * 用户协议
   */
  onUserAgreement() {
    wx.navigateTo({
      url: '/pages/webview/webview?type=userAgreement&title=用户协议'
    });
  },

  /**
   * 隐私政策
   */
  onPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/webview/webview?type=privacyPolicy&title=隐私政策'
    });
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '确认退出登录',
      content: '退出后需要重新登录才能同步数据',
      confirmText: '确认退出',
      cancelText: '取消',
      confirmColor: '#B22222',
      success: (res) => {
        if (res.confirm) {
          // 清除登录状态
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.isLoggedIn = false;
          wx.setStorageSync('userInfo', userInfo);

          wx.showToast({ title: '已退出登录', icon: 'success' });

          // 跳转到 me 页面
          setTimeout(() => {
            wx.switchTab({ url: '/pages/me/me' });
          }, 1000);
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/settings/settings',
      imageUrl: '/assets/share.png'
    }
  }
})
