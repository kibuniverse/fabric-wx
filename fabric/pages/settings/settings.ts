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
      content: '注销将删除所有云端数据，本地未同步的图解将保留',
      confirmText: '确认注销',
      cancelText: '我再想想',
      confirmColor: '#B22222',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在注销...', mask: true });
          try {
            // 清理已同步的本地图解数据（保留未同步数据）
            this.cleanupSyncedDiagramsForAccountDeletion();

            // 调用云函数删除用户数据（包括云端图解数据）
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
                // app.stopCounterHeartbeat(); // 心跳同步已禁用
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
   * 注销账号时清理已同步的图解数据
   * 保留未同步数据（syncStatus='local'），并重置其 syncStatus
   * 因为云端数据已删除，未同步的图解不再有云端关联
   */
  cleanupSyncedDiagramsForAccountDeletion() {
    const imageList = wx.getStorageSync('imageList') || [];
    const fileList = wx.getStorageSync('fileList') || [];

    // 删除已同步的本地文件
    for (const item of imageList) {
      if (item.syncStatus === 'synced') {
        this.removeDiagramFiles(item);
      }
    }
    for (const item of fileList) {
      if (item.syncStatus === 'synced') {
        this.removeDiagramFiles(item);
      }
    }

    // 保留未同步数据，重置 syncStatus 为 'local'
    const remainingImages = imageList
      .filter((i: any) => i.syncStatus === 'local')
      .map((i: any) => ({ ...i, syncStatus: 'local' }));
    const remainingFiles = fileList
      .filter((i: any) => i.syncStatus === 'local')
      .map((i: any) => ({ ...i, syncStatus: 'local' }));

    wx.setStorageSync('imageList', remainingImages);
    wx.setStorageSync('fileList', remainingFiles);
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

            // app.stopCounterHeartbeat(); // 心跳同步已禁用
          }

          // 清理已同步的图解数据（保留未同步数据）
          this.cleanupSyncedDiagrams();

          // 清除登录状态
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.isLoggedIn = false;
          wx.setStorageSync('userInfo', userInfo);

          // 清除针织总时长缓存（云端已同步，本地可安全清空）
          wx.removeStorageSync('total_zhizhi_time');
          if (app) {
            app.globalData.totalKnittingTime = 0;
            // 重置本地计数器（云端数据仍存在，下次登录会下载）
            app.resetLocalCountersForLogout();
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

  /**
   * 退出登录时清理已同步的图解数据
   * 保留未同步数据（syncStatus='local'）
   */
  cleanupSyncedDiagrams() {
    const imageList = wx.getStorageSync('imageList') || [];
    const fileList = wx.getStorageSync('fileList') || [];
    const allItems = [...imageList, ...fileList];

    // 遍历所有图解，删除已同步的本地文件
    for (const item of allItems) {
      if (item.syncStatus === 'synced') {
        // 已同步：删除本地文件
        this.removeDiagramFiles(item);
      }
      // 未同步（syncStatus='local'）：保留记录和文件
    }

    // 更新本地存储：只保留未同步数据
    const remainingImages = imageList.filter((i: any) => i.syncStatus === 'local');
    const remainingFiles = fileList.filter((i: any) => i.syncStatus === 'local');
    wx.setStorageSync('imageList', remainingImages);
    wx.setStorageSync('fileList', remainingFiles);
  },

  /**
   * 删除图解关联的所有本地文件
   */
  removeDiagramFiles(item: any) {
    // 删除图片文件
    if (item.paths && item.paths.length > 0) {
      item.paths.forEach((filePath: string) => {
        wx.removeSavedFile({
          filePath,
          success: () => console.log('删除图片成功:', filePath),
          fail: (err: any) => console.error('删除图片失败:', filePath, err)
        });
      });
    }
    // 删除封面文件（如果与 paths 不同）
    if (item.cover && item.cover !== item.paths?.[0]) {
      wx.removeSavedFile({
        filePath: item.cover,
        success: () => console.log('删除封面成功:', item.cover),
        fail: (err: any) => console.error('删除封面失败:', item.cover, err)
      });
    }
    // 删除 PDF 源文件
    if (item.pdfSourcePath) {
      wx.removeSavedFile({
        filePath: item.pdfSourcePath,
        success: () => console.log('删除PDF源文件成功:', item.pdfSourcePath),
        fail: (err: any) => console.error('删除PDF源文件失败:', item.pdfSourcePath, err)
      });
    }
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/settings/settings',
      imageUrl: '/assets/share.png'
    }
  }
})
