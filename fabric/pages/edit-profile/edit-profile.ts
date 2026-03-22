Page({
  data: {
    avatarUrl: '',
    nickName: '',
    zhizhiId: '',
    avatarLoading: false,
  },

  // 请求锁，防止并发重复请求
  _isRefreshingAvatar: false,

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      let avatarUrl = userInfo.avatarUrl || '';

      // 处理 cloud:// 协议头像
      if (avatarUrl.startsWith('cloud://')) {
        const cachedUrl = wx.getStorageSync(`avatar_url_${avatarUrl}`);
        const expireTime = wx.getStorageSync(`avatar_expire_${avatarUrl}`);

        if (cachedUrl && expireTime && Date.now() < expireTime) {
          avatarUrl = cachedUrl;
        } else {
          // 缓存过期或不存在，先使用旧缓存（如果有），后台静默刷新
          if (cachedUrl) {
            avatarUrl = cachedUrl;
          }
          // 后台静默刷新缓存
          this.refreshAvatarCache(userInfo.avatarUrl);
        }
      }

      this.setData({
        avatarUrl,
        nickName: userInfo.nickName || '微信用户',
        zhizhiId: userInfo.zhizhiId || '',
      });
    }
  },

  /**
   * 静默刷新头像缓存（后台刷新，不显示占位图）
   */
  async refreshAvatarCache(fileID: string, retryCount: number = 0) {
    if (this._isRefreshingAvatar) return;
    this._isRefreshingAvatar = true;

    const MAX_RETRY = 3;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (res.fileList?.[0]?.tempFileURL) {
        const tempUrl = res.fileList[0].tempFileURL;
        wx.setStorageSync(`avatar_url_${fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);
        this.setData({ avatarUrl: tempUrl });
      }
    } catch (e) {
      console.error('静默刷新头像缓存失败:', e);
      if (retryCount < MAX_RETRY) {
        setTimeout(() => {
          this._isRefreshingAvatar = false;
          this.refreshAvatarCache(fileID, retryCount + 1);
          return;
        }, 1000 * (retryCount + 1));
      }
    } finally {
      this._isRefreshingAvatar = false;
    }
  },

  async onChooseAvatar(e: any) {
    const { avatarUrl: newAvatarPath } = e.detail;

    // 获取旧头像 URL 用于清理缓存
    const userInfo = wx.getStorageSync('userInfo') || {};
    const oldAvatarUrl = userInfo.avatarUrl;

    // 显示加载状态
    this.setData({ avatarLoading: true });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 上传到云存储
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath,
        filePath: newAvatarPath,
      });

      if (uploadResult.fileID) {
        // 清理旧头像缓存
        if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://')) {
          wx.removeStorageSync(`avatar_url_${oldAvatarUrl}`);
          wx.removeStorageSync(`avatar_expire_${oldAvatarUrl}`);
        }

        // 更新本地存储
        userInfo.avatarUrl = uploadResult.fileID;
        wx.setStorageSync('userInfo', userInfo);

        // 获取临时 URL 显示
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [uploadResult.fileID] });
        const tempUrl = tempRes.fileList?.[0]?.tempFileURL || newAvatarPath;

        // 缓存临时 URL
        wx.setStorageSync(`avatar_url_${uploadResult.fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${uploadResult.fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);

        this.setData({ avatarUrl: tempUrl, avatarLoading: false });

        // 同步到云端
        const app = getApp<IAppOption>();
        if (app) {
          await app.syncToCloud(0);
        }

        wx.showToast({ title: '头像已更新', icon: 'success' });
      }
    } catch (error) {
      console.error('上传头像失败:', error);
      this.setData({ avatarLoading: false });
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onEditNickname() {
    wx.navigateTo({
      url: '/pages/edit-nickname/edit-nickname',
    });
  },

  onViewZhizhiId() {
    wx.navigateTo({
      url: '/pages/edit-zhizhi-id/edit-zhizhi-id',
    });
  },
});