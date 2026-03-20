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
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    // 尝试从本地存储获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.isLoggedIn) {
      // 如果没有知织号，生成一个
      if (!userInfo.zhizhiId) {
        userInfo.zhizhiId = this.generateZhizhiId();
        wx.setStorageSync('userInfo', userInfo);
      }
      this.setData({
        avatarUrl: userInfo.avatarUrl || '',
        nickName: userInfo.nickName || '微信用户',
        isLoggedIn: true,
        zhizhiId: userInfo.zhizhiId || ''
      });
      this.loadTotalTime();
    } else {
      this.setData({ isLoggedIn: false });
    }
  },

  /**
   * 生成知织号（9位随机数字）
   */
  generateZhizhiId(): string {
    return Math.floor(100000000 + Math.random() * 900000000).toString();
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
   * 微信登录 - 打开登录对话框
   */
  onLogin() {
    if (!this.data.isChecked) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }
    // 打开登录对话框
    this.setData({
      showLoginDialog: true,
      tempAvatarUrl: '',
      tempNickName: ''
    });
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
   * 确认登录
   */
  confirmLogin() {
    const { tempAvatarUrl, tempNickName } = this.data;

    // 验证头像和昵称
    if (!tempAvatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }
    if (!tempNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    // 调用 wx.login 获取 code（静默登录）
    wx.login({
      success: (loginRes) => {
        // 登录成功，保存用户信息
        const zhizhiId = this.generateZhizhiId();
        const userInfo = {
          avatarUrl: tempAvatarUrl,
          nickName: tempNickName.trim(),
          isLoggedIn: true,
          code: loginRes.code,
          zhizhiId: zhizhiId
        };
        wx.setStorageSync('userInfo', userInfo);

        this.setData({
          avatarUrl: tempAvatarUrl,
          nickName: tempNickName.trim(),
          showLoginDialog: false,
          isLoggedIn: true,
          zhizhiId: zhizhiId
        });

        this.loadTotalTime();
        wx.showToast({ title: '登录成功', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
    });
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
      success: (res) => {
        if (res.confirm && res.content) {
          const newNickName = res.content.trim();
          if (newNickName) {
            this.setData({ nickName: newNickName });
            // 更新本地存储
            const userInfo = wx.getStorageSync('userInfo') || {};
            userInfo.nickName = newNickName;
            wx.setStorageSync('userInfo', userInfo);
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