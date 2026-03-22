// pages/me/me.ts

// 本地头像存储 key
const LOCAL_AVATAR_PATH_KEY = 'local_avatar_path';
const LOCAL_AVATAR_FILE_ID_KEY = 'local_avatar_file_id';

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
    totalTimeHours: 24, // 知织总时长（小时），默认24
    zhizhiId: '', // 知织号（9位唯一ID）
    isLoggingIn: false, // 是否正在登录中
    avatarLoading: false, // 头像是否正在加载中
  },

  // 请求锁，防止并发重复请求
  _isRefreshingAvatar: false,
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
    // 重新检查登录状态
    this.loadUserInfo();
  },

  /**
   * 获取头像临时 URL 并缓存（带重试机制）
   * cloud:// 协议需要转换为 https:// 临时 URL 才能直接加载
   * @param fileID 云文件ID
   * @param retryCount 当前重试次数
   */
  async getAvatarTempUrl(fileID: string, retryCount: number = 0) {
    const MAX_RETRY = 3;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (res.fileList?.[0]?.tempFileURL) {
        const tempUrl = res.fileList[0].tempFileURL;
        // 缓存临时 URL（有效期 2 小时，设为 1.5 小时留余量）
        wx.setStorageSync(`avatar_url_${fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);
        this.setData({ avatarUrl: tempUrl, avatarLoading: false });
      } else {
        this.setData({ avatarLoading: false });
      }
    } catch (e) {
      console.error('获取头像临时 URL 失败:', e);
      // 重试逻辑
      if (retryCount < MAX_RETRY) {
        console.log(`重试获取头像临时 URL (${retryCount + 1}/${MAX_RETRY})...`);
        setTimeout(() => {
          this.getAvatarTempUrl(fileID, retryCount + 1);
        }, 1000 * (retryCount + 1)); // 递增延迟
      } else {
        this.setData({ avatarLoading: false });
      }
    }
  },

  /**
   * 静默刷新头像缓存（后台刷新，不显示占位图）
   * @param fileID 云文件ID
   * @param retryCount 当前重试次数
   */
  async refreshAvatarCache(fileID: string, retryCount: number = 0) {
    // 防止并发重复请求
    if (this._isRefreshingAvatar) return;
    this._isRefreshingAvatar = true;

    const MAX_RETRY = 3;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (res.fileList?.[0]?.tempFileURL) {
        const tempUrl = res.fileList[0].tempFileURL;
        // 缓存临时 URL
        wx.setStorageSync(`avatar_url_${fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);
        // 更新页面显示
        this.setData({ avatarUrl: tempUrl });
      }
    } catch (e) {
      console.error('静默刷新头像缓存失败:', e);
      // 重试逻辑
      if (retryCount < MAX_RETRY) {
        console.log(`重试刷新头像缓存 (${retryCount + 1}/${MAX_RETRY})...`);
        setTimeout(() => {
          this._isRefreshingAvatar = false; // 重置锁以便重试
          this.refreshAvatarCache(fileID, retryCount + 1);
          return;
        }, 1000 * (retryCount + 1));
      }
      // 重试失败，保留显示旧头像，不下沉到占位图
    } finally {
      this._isRefreshingAvatar = false;
    }
  },

  /**
   * 下载并保存头像到本地持久化存储
   * @param fileID 云文件ID 或临时 URL
   * @returns 本地文件路径，失败返回空字符串
   */
  async downloadAndSaveAvatar(fileID: string): Promise<string> {
    if (this._isDownloadingAvatar) return '';
    this._isDownloadingAvatar = true;

    try {
      let downloadUrl = fileID;

      // 如果是 cloud:// 协议，先获取临时 URL
      if (fileID.startsWith('cloud://')) {
        const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
        if (res.fileList?.[0]?.tempFileURL) {
          downloadUrl = res.fileList[0].tempFileURL;
        } else {
          throw new Error('获取临时 URL 失败');
        }
      }

      // 下载文件
      const downloadRes = await wx.downloadFile({ url: downloadUrl });
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
      if (fileID.startsWith('cloud://')) {
        wx.setStorageSync(LOCAL_AVATAR_FILE_ID_KEY, fileID);
      }

      console.log('头像已保存到本地:', savedPath);
      return savedPath;
    } catch (e) {
      console.error('下载并保存头像失败:', e);
      return '';
    } finally {
      this._isDownloadingAvatar = false;
    }
  },

  /**
   * 获取本地头像路径
   * @returns 本地头像路径，不存在返回空字符串
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
   * 加载用户信息
   */
  async loadUserInfo() {
    // 尝试从本地存储获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.isLoggedIn) {
      let avatarUrl = userInfo.avatarUrl || '';

      // 优先使用本地持久化头像
      const localAvatarPath = this.getLocalAvatarPath();
      const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

      if (localAvatarPath && localAvatarFileId === avatarUrl) {
        // 本地头像存在且与当前用户匹配，直接使用
        avatarUrl = localAvatarPath;
      } else if (avatarUrl.startsWith('cloud://')) {
        // 本地头像不存在或不匹配，尝试从缓存或云端获取
        const cachedUrl = wx.getStorageSync(`avatar_url_${avatarUrl}`);
        const expireTime = wx.getStorageSync(`avatar_expire_${avatarUrl}`);

        if (cachedUrl && expireTime && Date.now() < expireTime) {
          // 使用缓存的临时 URL
          avatarUrl = cachedUrl;
        } else {
          // 缓存过期或不存在，先使用旧缓存（如果有），后台静默刷新
          if (cachedUrl) {
            avatarUrl = cachedUrl;
          }
          // 后台静默刷新缓存并下载到本地
          this.refreshAndSaveAvatar(userInfo.avatarUrl);
        }
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

      // 如果 userInfo 不存在（注销后），重置为默认值
      // 如果 userInfo 存在但 isLoggedIn 为 false（退出登录），保留显示
      if (!userInfo) {
        this.setData({
          avatarUrl: '',
          nickName: '微信用户',
          zhizhiId: '',
          totalTimeHours: 0,
        });
      } else {
        // 退出登录状态，显示之前保存的信息
        this.setData({
          avatarUrl: userInfo.avatarUrl || '',
          nickName: userInfo.nickName || '微信用户',
          zhizhiId: '',
          totalTimeHours: 0,
        });
      }
    }
  },

  /**
   * 后台静默刷新缓存并下载保存头像到本地
   */
  async refreshAndSaveAvatar(fileID: string) {
    if (this._isRefreshingAvatar || this._isDownloadingAvatar) return;
    this._isRefreshingAvatar = true;

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (res.fileList?.[0]?.tempFileURL) {
        const tempUrl = res.fileList[0].tempFileURL;
        // 缓存临时 URL
        wx.setStorageSync(`avatar_url_${fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);
        // 更新页面显示
        this.setData({ avatarUrl: tempUrl });

        // 后台下载保存到本地
        this.downloadAndSaveAvatar(fileID).then((localPath) => {
          if (localPath) {
            this.setData({ avatarUrl: localPath });
          }
        });
      }
    } catch (e) {
      console.error('刷新头像缓存失败:', e);
    } finally {
      this._isRefreshingAvatar = false;
    }
  },

  /**
   * 从云端同步数据
   */
  async syncCloudData() {
    const app = getApp<IAppOption>();
    if (app) {
      const result = await app.syncFromCloud();
      if (result) {
        const { totalKnittingTime, zhizhiId, nickName, avatarUrl } = result;
        const hours = Math.floor((totalKnittingTime || 0) / 3600000);

        // 更新页面数据
        this.setData({
          totalTimeHours: hours,
          zhizhiId: zhizhiId || this.data.zhizhiId,
        });

        // 更新本地存储的用户信息
        const userInfo = wx.getStorageSync('userInfo') || {};
        if (zhizhiId) userInfo.zhizhiId = zhizhiId;
        if (nickName) userInfo.nickName = nickName;
        if (avatarUrl) {
          userInfo.avatarUrl = avatarUrl;

          // 优先使用本地持久化头像
          const localAvatarPath = this.getLocalAvatarPath();
          const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

          if (localAvatarPath && localAvatarFileId === avatarUrl) {
            // 本地头像存在且与云端匹配，直接使用
            this.setData({ avatarUrl: localAvatarPath });
          } else if (avatarUrl.startsWith('cloud://')) {
            const cachedUrl = wx.getStorageSync(`avatar_url_${avatarUrl}`);
            const expireTime = wx.getStorageSync(`avatar_expire_${avatarUrl}`);

            if (cachedUrl && expireTime && Date.now() < expireTime) {
              this.setData({ avatarUrl: cachedUrl });
            } else {
              // 缓存过期或不存在，先使用旧缓存（如果有），后台静默刷新
              if (cachedUrl) {
                this.setData({ avatarUrl: cachedUrl });
              }
              // 后台静默刷新缓存并下载到本地
              this.refreshAndSaveAvatar(avatarUrl);
            }
          } else {
            this.setData({ avatarUrl });
          }
        }
        wx.setStorageSync('userInfo', userInfo);
      }
    }
  },

  /**
   * 加载知织总时长
   */
  loadTotalTime() {
    const totalTime = wx.getStorageSync('total_zhizhi_time') || 0;
    const hours = Math.floor(totalTime / 3600000); // 毫秒转小时
    this.setData({ totalTimeHours: hours });
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
        let avatarUrl = cloudAvatarUrl;

        // 优先使用本地持久化头像
        const localAvatarPath = this.getLocalAvatarPath();
        const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

        if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
          // 本地头像存在且与云端匹配，直接使用
          avatarUrl = localAvatarPath;
        } else if (cloudAvatarUrl.startsWith('cloud://')) {
          // 本地头像不存在或不匹配，尝试从缓存获取
          const cachedUrl = wx.getStorageSync(`avatar_url_${cloudAvatarUrl}`);
          const expireTime = wx.getStorageSync(`avatar_expire_${cloudAvatarUrl}`);

          if (cachedUrl && expireTime && Date.now() < expireTime) {
            avatarUrl = cachedUrl;
          } else {
            // 缓存过期或不存在，先使用旧缓存（如果有），后台静默刷新
            if (cachedUrl) {
              avatarUrl = cachedUrl;
            }
            // 后台静默刷新缓存并下载到本地
            this.refreshAndSaveAvatar(cloudAvatarUrl);
          }
        }

        const userInfo = {
          avatarUrl: cloudAvatarUrl,
          nickName: userData.nickName || '微信用户',
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
        };
        wx.setStorageSync('userInfo', userInfo);

        this.setData({
          avatarUrl,
          nickName: userInfo.nickName,
          isLoggedIn: true,
          zhizhiId: userInfo.zhizhiId,
        });

        // 加载总时长
        const totalTime = userData.totalKnittingTime || 0;
        const hours = Math.floor(totalTime / 3600000);
        this.setData({ totalTimeHours: hours });
        wx.setStorageSync('total_zhizhi_time', totalTime);

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

      // 网络错误或超时，只 toast 提示，不显示登录弹窗
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
      // 1. 将临时头像上传到云存储（如果是临时文件路径）
      let finalAvatarUrl = tempAvatarUrl;
      let tempUrlForDisplay = tempAvatarUrl; // 用于页面显示的临时 URL

      // 判断是否为临时文件（需要上传到云存储）
      if (tempAvatarUrl.startsWith('wxfile://') || tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl.startsWith('https://tmp')) {
        const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl,
        });

        if (uploadResult.fileID) {
          finalAvatarUrl = uploadResult.fileID;
          // 立即获取并缓存临时 URL
          try {
            const tempRes = await wx.cloud.getTempFileURL({ fileList: [finalAvatarUrl] });
            if (tempRes.fileList?.[0]?.tempFileURL) {
              tempUrlForDisplay = tempRes.fileList[0].tempFileURL;
              wx.setStorageSync(`avatar_url_${finalAvatarUrl}`, tempUrlForDisplay);
              wx.setStorageSync(`avatar_expire_${finalAvatarUrl}`, Date.now() + 1.5 * 60 * 60 * 1000);
            }
          } catch (e) {
            console.error('获取头像临时 URL 失败:', e);
          }
        }
      }

      // 2. 调用云函数登录
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
        };
        wx.setStorageSync('userInfo', userInfo);

        // 更新页面数据
        this.setData({
          avatarUrl: tempUrlForDisplay,
          nickName: tempNickName.trim(),
          showLoginDialog: false,
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
        });

        // 后台下载并保存头像到本地
        if (finalAvatarUrl.startsWith('cloud://')) {
          this.downloadAndSaveAvatar(finalAvatarUrl).then((localPath) => {
            if (localPath) {
              this.setData({ avatarUrl: localPath });
            }
          });
        }

        // 加载总时长
        const totalTime = userData.totalKnittingTime || 0;
        const hours = Math.floor(totalTime / 3600000);
        this.setData({ totalTimeHours: hours });
        wx.setStorageSync('total_zhizhi_time', totalTime);

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
    // TODO: 跳转到用户协议页面
    wx.showToast({ title: '用户协议页面待实现', icon: 'none' });
  },

  /**
   * 点击隐私政策
   */
  onPrivacyPolicy() {
    // TODO: 跳转到隐私政策页面
    wx.showToast({ title: '隐私政策页面待实现', icon: 'none' });
  },

  /**
   * 跳转到设置页面
   */
  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
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