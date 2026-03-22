// pages/me/me.ts
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
  },

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
   * 加载用户信息
   */
  async loadUserInfo() {
    // 尝试从本地存储获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.isLoggedIn) {
      this.setData({
        avatarUrl: userInfo.avatarUrl || '',
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
        if (avatarUrl) userInfo.avatarUrl = avatarUrl;
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
        const userInfo = {
          avatarUrl: userData.avatarUrl || '',
          nickName: userData.nickName || '微信用户',
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
        };
        wx.setStorageSync('userInfo', userInfo);

        this.setData({
          avatarUrl: userInfo.avatarUrl,
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

      // 判断是否为临时文件（需要上传到云存储）
      if (tempAvatarUrl.startsWith('wxfile://') || tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl.startsWith('https://tmp')) {
        const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempAvatarUrl,
        });

        if (uploadResult.fileID) {
          finalAvatarUrl = uploadResult.fileID;
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
          avatarUrl: finalAvatarUrl,
          nickName: tempNickName.trim(),
          showLoginDialog: false,
          isLoggedIn: true,
          zhizhiId: userData.zhizhiId,
        });

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