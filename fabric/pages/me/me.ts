// pages/me/me.ts
Page({
  data: {
    avatarUrl: '', // 默认头像
    nickName: '微信用户',
    isChecked: false, // 复选框状态
  },

  onLoad() {
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
    if (userInfo) {
      this.setData({
        avatarUrl: userInfo.avatarUrl || '',
        nickName: userInfo.nickName || '微信用户'
      });
    }
  },

  /**
   * 复选框切换
   */
  onCheckboxChange() {
    this.setData({ isChecked: !this.data.isChecked });
  },

  /**
   * 微信登录
   */
  onLogin() {
    if (!this.data.isChecked) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }
    // 登录逻辑
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        const { userInfo } = res;
        this.setData({
          avatarUrl: userInfo.avatarUrl,
          nickName: userInfo.nickName
        });
        // 保存用户信息到本地
        wx.setStorageSync('userInfo', {
          avatarUrl: userInfo.avatarUrl,
          nickName: userInfo.nickName
        });
        wx.showToast({ title: '登录成功', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '登录取消', icon: 'none' });
      }
    });
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