// pages/me/me.ts

// 本地头像存储 key
const LOCAL_AVATAR_PATH_KEY = 'local_avatar_path';
const LOCAL_AVATAR_FILE_ID_KEY = 'local_avatar_file_id';

/**
 * 格式化针织总时长
 * @param totalMs 总时长（毫秒）
 * @returns 格式化后的小时数（整数或一位小数）
 */
function formatTotalTime(totalMs: number): string | number {
  const hours = totalMs / 3600000;
  const hoursFixed = parseFloat(hours.toFixed(1));
  const decimalPart = hoursFixed - Math.floor(hoursFixed);
  if (decimalPart > 0) {
    return hoursFixed.toFixed(1);
  }
  return Math.floor(hoursFixed);
}

Page({
  data: {
    statusBarHeight: 0, // 状态栏高度
    navBarHeight: 0, // 导航栏高度（包含胶囊按钮）
    contentTop: 0, // 内容区域距离顶部的距离
    avatarUrl: '', // 默认头像
    nickName: '微信用户',
    isChecked: false, // 复选框状态
    showLoginDialog: false, // 登录对话框显示状态
    tempAvatarUrl: '', // 临时头像URL
    tempNickName: '', // 临时昵称
    isLoggedIn: false, // 登录状态
    totalTimeHours: 0, // 知织总时长（小时），默认0
    zhizhiId: '', // 知织号（9位唯一ID）
    isLoggingIn: false, // 是否正在登录中
  },

  // 下载锁，防止并发下载
  _isDownloadingAvatar: false,

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    // 胶囊按钮区域高度 = statusBarHeight + 32px（胶囊高度）+ 4px（胶囊与状态栏间距）≈ statusBarHeight + 44px
    const navBarHeight = systemInfo.statusBarHeight + 44;
    // 内容区域 top = navBarHeight（距离微信胶囊按钮底部 0）
    const contentTop = navBarHeight;
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight,
      navBarHeight: navBarHeight,
      contentTop: contentTop
    });
    // 页面加载时尝试获取用户信息
    this.loadUserInfo();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 }); // me 是第三个 tab
    }

    // 检查是否需要刷新页面（账号失效后跳转）
    const app = getApp<IAppOption>();
    if (app && app.globalData.needRefreshMePage) {
      app.globalData.needRefreshMePage = false; // 重置标志位
      // 直接设置为未登录状态
      this.setData({
        avatarUrl: '',
        nickName: '微信用户',
        isLoggedIn: false,
        zhizhiId: '',
        totalTimeHours: 0,
      });
      return;
    }

    // 重新检查登录状态
    this.loadUserInfo();
  },

  /**
   * 获取本地头像路径
   */
  getLocalAvatarPath(): string {
    return wx.getStorageSync(LOCAL_AVATAR_PATH_KEY) || '';
  },

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
   * 将临时文件保存到本地持久化存储
   * @param tempFilePath 临时文件路径
   * @param fileID 云文件ID
   * @returns 本地文件路径，失败返回空字符串
   */
  saveLocalAvatarFromTemp(tempFilePath: string, fileID: string): string {
    try {
      // 先清除旧的本地头像
      this.clearLocalAvatar();

      // 保存到本地持久化存储
      const savedPath = wx.getFileSystemManager().saveFileSync(tempFilePath);
      if (savedPath) {
        wx.setStorageSync(LOCAL_AVATAR_PATH_KEY, savedPath);
        wx.setStorageSync(LOCAL_AVATAR_FILE_ID_KEY, fileID);
        return savedPath;
      }
      return '';
    } catch (e) {
      console.error('保存本地头像失败:', e);
      return '';
    }
  },

  /**
   * 下载并保存头像到本地持久化存储
   * @param fileID 云文件ID
   * @param retryCount 重试次数
   * @returns 本地文件路径，失败返回空字符串
   */
  async downloadAndSaveAvatar(fileID: string, retryCount: number = 3): Promise<string> {
    if (this._isDownloadingAvatar) return '';
    this._isDownloadingAvatar = true;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        // 获取临时下载 URL
        const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
        const downloadUrl = res.fileList?.[0]?.tempFileURL;
        if (!downloadUrl) {
          throw new Error('获取临时URL失败');
        }

        // 下载文件 - 使用 Promise 包装等待下载完成
        const downloadRes = await new Promise<WechatMiniprogram.DownloadSuccessCallbackResult>((resolve, reject) => {
          wx.downloadFile({
            url: downloadUrl,
            success: resolve,
            fail: reject,
          });
        });
        if (downloadRes.statusCode !== 200) {
          throw new Error('下载失败');
        }

        // 保存到本地持久化存储
        const savedPath = await new Promise<string>((resolve, reject) => {
          wx.getFileSystemManager().saveFile({
            tempFilePath: downloadRes.tempFilePath,
            success: (res) => resolve(res.savedFilePath),
            fail: (err) => reject(err),
          });
        });

        // 存储本地路径和对应的云文件 ID
        wx.setStorageSync(LOCAL_AVATAR_PATH_KEY, savedPath);
        wx.setStorageSync(LOCAL_AVATAR_FILE_ID_KEY, fileID);

        this._isDownloadingAvatar = false;
        return savedPath;
      } catch (e) {
        console.error(`下载头像失败 (尝试 ${attempt}/${retryCount}):`, e);
        if (attempt < retryCount) {
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }

    this._isDownloadingAvatar = false;
    return '';
  },

  /**
   * 加载用户信息
   */
  async loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.isLoggedIn) {
      const cloudAvatarUrl = userInfo.avatarUrl || '';

      // 优先使用本地持久化头像
      const localAvatarPath = this.getLocalAvatarPath();
      const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

      let avatarUrl = '';
      if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
        // 本地头像存在且匹配，直接使用
        avatarUrl = localAvatarPath;
      } else if (cloudAvatarUrl.startsWith('cloud://')) {
        // 本地头像不存在或不匹配，同步下载并保存
        const downloadedPath = await this.downloadAndSaveAvatar(cloudAvatarUrl);
        if (downloadedPath) {
          avatarUrl = downloadedPath;
        }
        // 下载失败时，avatarUrl 保持空字符串，显示默认头像
      }

      this.setData({
        avatarUrl,
        nickName: userInfo.nickName || '微信用户',
        isLoggedIn: true,
        zhizhiId: userInfo.zhizhiId || ''
      });
      this.loadTotalTime();

      // 已登录用户，尝试从云端同步最新数据
      await this.syncCloudData();
    } else {
      // 未登录状态
      this.setData({ isLoggedIn: false });

      if (!userInfo) {
        this.setData({
          avatarUrl: '',
          nickName: '微信用户',
          zhizhiId: '',
          totalTimeHours: 0,
        });
      } else {
        // 退出登录状态，尝试使用本地缓存的头像
        const localAvatarPath = this.getLocalAvatarPath();
        const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);
        const cloudAvatarUrl = userInfo.avatarUrl || '';

        let avatarUrl = '';
        if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
          avatarUrl = localAvatarPath;
        }

        this.setData({
          avatarUrl,
          nickName: userInfo.nickName || '微信用户',
          zhizhiId: '',
          totalTimeHours: 0,
        });
      }
    }
  },

  /**
   * 从云端同步数据
   */
  async syncCloudData() {
    const app = getApp<IAppOption>();
    if (!app) return;

    const result = await app.syncFromCloud();
    if (!result) return;

    const { totalKnittingTime, zhizhiId, zhizhiIdModified, nickName, avatarUrl: cloudAvatarUrl } = result;

    // 更新页面数据
    this.setData({
      totalTimeHours: formatTotalTime(totalKnittingTime || 0),
      zhizhiId: zhizhiId || this.data.zhizhiId,
    });

    // 更新本地存储的用户信息
    const userInfo = wx.getStorageSync('userInfo') || {};
    if (zhizhiId) userInfo.zhizhiId = zhizhiId;
    if (zhizhiIdModified !== undefined) userInfo.zhizhiIdModified = zhizhiIdModified;
    if (nickName) userInfo.nickName = nickName;

    if (cloudAvatarUrl) {
      userInfo.avatarUrl = cloudAvatarUrl;

      // 优先使用本地持久化头像
      const localAvatarPath = this.getLocalAvatarPath();
      const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

      if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
        this.setData({ avatarUrl: localAvatarPath });
      } else if (cloudAvatarUrl.startsWith('cloud://')) {
        // 本地头像不存在或不匹配，同步下载并保存
        const downloadedPath = await this.downloadAndSaveAvatar(cloudAvatarUrl);
        if (downloadedPath) {
          this.setData({ avatarUrl: downloadedPath });
        }
      }
    }
    wx.setStorageSync('userInfo', userInfo);
  },

  /**
   * 加载知织总时长
   */
  loadTotalTime() {
    const totalTime = wx.getStorageSync('total_zhizhi_time') || 0;
    this.setData({ totalTimeHours: formatTotalTime(totalTime) });
  },

  /**
   * 复选框切换
   */
  onCheckboxChange() {
    this.setData({ isChecked: !this.data.isChecked });
  },

  /**
   * 微信登录 - 验证云端数据后登录
   */
  async onLogin() {
    if (!this.data.isChecked) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }

    // 检查网络状态
    try {
      const networkInfo = await wx.getNetworkType();
      if (networkInfo.networkType === 'none') {
        wx.showToast({ title: '网络不可用，请检查网络连接', icon: 'none' });
        return;
      }
    } catch (e) {
      // 获取网络状态失败，继续尝试登录
    }

    wx.showLoading({ title: '检查登录状态...', mask: true });

    try {
      // 带超时的云函数调用（10秒超时）
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 10000);
      });

      const cloudCall = wx.cloud.callFunction({
        name: 'getUserData',
      });

      const res = await Promise.race([cloudCall, timeout]) as any;

      wx.hideLoading();

      if (res.result && res.result.success && res.result.data) {
        // 云端有用户数据，直接登录
        const userData = res.result.data;
        const cloudAvatarUrl = userData.avatarUrl || '';

        // 保存用户信息
        const userInfo = {
          avatarUrl: cloudAvatarUrl,
          nickName: userData.nickName || '微信用户',
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
          zhizhiIdModified: userData.zhizhiIdModified || false,
        };
        wx.setStorageSync('userInfo', userInfo);

        // 优先使用本地持久化头像
        const localAvatarPath = this.getLocalAvatarPath();
        const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

        let avatarUrl = '';
        if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
          avatarUrl = localAvatarPath;
        } else if (cloudAvatarUrl.startsWith('cloud://')) {
          // 本地头像不存在或不匹配，同步下载并保存
          const downloadedPath = await this.downloadAndSaveAvatar(cloudAvatarUrl);
          if (downloadedPath) {
            avatarUrl = downloadedPath;
          }
        }

        this.setData({
          avatarUrl,
          nickName: userInfo.nickName,
          isLoggedIn: true,
          zhizhiId: userInfo.zhizhiId,
        });

        // 加载总时长
        const totalTime = userData.totalKnittingTime || 0;
        this.setData({ totalTimeHours: formatTotalTime(totalTime) });
        wx.setStorageSync('total_zhizhi_time', totalTime);

        // 同步更新全局数据（避免旧缓存污染）
        const app = getApp<IAppOption>();
        if (app) {
          app.globalData.totalKnittingTime = totalTime;
          // 重置账号失效标志（用户重新登录）
          app.globalData.accountInvalidatedShown = false;
          // 预加载图解数据（加速首页显示）
          app.preloadDiagrams().catch(err => {
            console.error('[Me] 预加载图解失败:', err);
          });
          // 处理计数器数据合并
          await app.handleLoginDataMerge();
        }

        wx.showToast({ title: '欢迎回来', icon: 'success' });
      } else {
        // 云端没有数据，清除本地缓存并显示登录对话框
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('total_zhizhi_time');

        this.setData({
          showLoginDialog: true,
          tempAvatarUrl: '',
          tempNickName: '',
          avatarUrl: '',
          nickName: '微信用户',
          isLoggedIn: false,
          zhizhiId: '',
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('检查用户状态失败:', error);
      wx.showToast({ title: '网络异常，请检查网络连接', icon: 'none' });
    }
  },

  /**
   * 选择头像回调
   */
  onChooseAvatar(e: any) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
  },

  /**
   * 昵称输入回调
   */
  onNicknameInput(e: any) {
    this.setData({ tempNickName: e.detail.value });
  },

  /**
   * 确认登录 - 调用云函数
   */
  async confirmLogin() {
    const { tempAvatarUrl, tempNickName, isLoggingIn } = this.data;

    // 防止重复点击
    if (isLoggingIn) return;

    // 验证头像和昵称
    if (!tempAvatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    if (!tempNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ isLoggingIn: true });
    wx.showLoading({ title: '登录中...', mask: true });

    try {
      // 上传头像到云存储
      let finalAvatarUrl = tempAvatarUrl;
      let localAvatarPath = '';

      if (tempAvatarUrl.startsWith('wxfile://') || tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl.startsWith('https://tmp')) {
        const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl,
        });
        if (uploadResult.fileID) {
          finalAvatarUrl = uploadResult.fileID;
          // 上传成功后，直接将临时文件保存到本地持久化存储
          localAvatarPath = this.saveLocalAvatarFromTemp(tempAvatarUrl, uploadResult.fileID);
        }
      }

      // 调用云函数登录
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {
          nickName: tempNickName.trim(),
          avatarUrl: finalAvatarUrl,
        },
      }) as any;

      wx.hideLoading();
      this.setData({ isLoggingIn: false });

      if (res.result && res.result.success) {
        const userData = res.result.data;

        // 保存用户信息到本地
        const userInfo = {
          avatarUrl: finalAvatarUrl,
          nickName: tempNickName.trim(),
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
          zhizhiIdModified: userData.zhizhiIdModified || false,
        };
        wx.setStorageSync('userInfo', userInfo);

        // 更新页面数据，优先使用本地持久化路径
        this.setData({
          avatarUrl: localAvatarPath || tempAvatarUrl,
          nickName: tempNickName.trim(),
          showLoginDialog: false,
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
        });

        // 加载总时长
        const totalTime = userData.totalKnittingTime || 0;
        this.setData({ totalTimeHours: formatTotalTime(totalTime) });
        wx.setStorageSync('total_zhizhi_time', totalTime);

        // 同步更新全局数据（避免旧缓存污染）
        const app = getApp<IAppOption>();
        if (app) {
          app.globalData.totalKnittingTime = totalTime;
          // 重置账号失效标志（用户重新登录）
          app.globalData.accountInvalidatedShown = false;
          // 预加载图解数据（加速首页显示）
          app.preloadDiagrams().catch(err => {
            console.error('[Me] 预加载图解失败:', err);
          });
          // 处理计数器数据合并（新用户可能本地有默认计数器的修改）
          await app.handleLoginDataMerge();
        }

        wx.showToast({
          title: res.result.isNewUser ? '注册成功' : '欢迎回来',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: res.result?.error || '登录失败，请重试',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      this.setData({ isLoggingIn: false });
      console.error('登录失败:', error);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
  },

  /**
   * 取消登录
   */
  cancelLogin() {
    this.setData({
      showLoginDialog: false,
      tempAvatarUrl: '',
      tempNickName: ''
    });
  },

  /**
   * 阻止对话框点击穿透
   */
  preventBubble() {
    // 空函数，用于阻止事件冒泡
  },

  /**
   * 编辑昵称
   */
  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: this.data.nickName,
      success: async (res) => {
        if (res.confirm && res.content) {
          const newNickName = res.content.trim();
          if (newNickName) {
            this.setData({ nickName: newNickName });
            // 更新本地存储
            const userInfo = wx.getStorageSync('userInfo') || {};
            userInfo.nickName = newNickName;
            wx.setStorageSync('userInfo', userInfo);

            // 同步到云端
            const app = getApp<IAppOption>();
            if (app) {
              await app.syncToCloud(0);
            }
          }
        }
      }
    });
  },

  /**
   * 点击用户协议
   */
  onUserAgreement() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=userAgreement'
    });
  },

  /**
   * 点击隐私政策
   */
  onPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacyPolicy'
    });
  },

  /**
   * 跳转到设置页面
   */
  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  /**
   * 显示圆角长条 Toast
   */
  showToast(message: string) {
    const toast = this.selectComponent('#toast');
    if (toast) {
      toast.showToast(message);
    }
  },

  /**
   * 复制知织 ID
   */
  onCopyZhizhiId() {
    const zhizhiId = this.data.zhizhiId;
    if (!zhizhiId) {
      this.showToast('知织号不存在');
      return;
    }
    wx.setClipboardData({
      data: zhizhiId
    });
    // 微信系统会自动弹出"已复制"提示
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/home/home',
      imageUrl: '/assets/share.png'
    };
  }
});