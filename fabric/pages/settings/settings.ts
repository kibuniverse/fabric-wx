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

              // 清除计数器相关缓存，重置为默认计数器
              const app = getApp<IAppOption>();
              if (app) {
                app.stopCounterHeartbeat();
                app.globalData.totalKnittingTime = 0;
                // 设置标志位：主动注销，不触发"登录状态已失效"弹窗
                app.globalData.accountInvalidatedShown = true;
                app.resetLocalCountersToDefault();
              }

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
      url: '/pages/agreement/agreement?type=userAgreement'
    });
  },

  /**
   * 隐私政策
   */
  onPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacyPolicy'
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
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...', mask: true });

          const app = getApp<IAppOption>();
          if (app) {
            // 先暂停针织计时器（如果在运行），确保本次时长已累加
            app.pauseKnittingSession(false); // false: 不触发 syncToCloud，我们后面会统一同步

            // 同步计数器数据到云端
            await app.syncCounterData('upload').catch(err => {
              console.error('同步计数器数据失败:', err);
            });

            // 强制同步针织总时长到云端（确保不丢失）
            await app.forceSyncTotalKnittingTime().catch(err => {
              console.error('同步针织总时长失败:', err);
            });

            app.stopCounterHeartbeat();
          }

          // 清除登录状态
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.isLoggedIn = false;
          wx.setStorageSync('userInfo', userInfo);

          // 清除针织总时长缓存（云端已同步，本地可安全清空）
          wx.removeStorageSync('total_zhizhi_time');
          if (app) {
            app.globalData.totalKnittingTime = 0;
            // 重置本地计数器为默认状态
            app.resetLocalCountersToDefault();
          }

          wx.hideLoading();
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
