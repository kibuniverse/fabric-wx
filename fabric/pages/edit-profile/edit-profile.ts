Page({
  data: {
    avatarUrl: '',
    nickName: '',
    zhizhiId: '',
    avatarLoading: false,
  },

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
          // 异步获取临时 URL，先显示占位图
          this.setData({ avatarLoading: true });
          this.getAvatarTempUrl(avatarUrl);
        }
      }

      this.setData({
        avatarUrl,
        nickName: userInfo.nickName || '微信用户',
        zhizhiId: userInfo.zhizhiId || '',
      });
    }
  },

  async getAvatarTempUrl(fileID: string) {
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (res.fileList?.[0]?.tempFileURL) {
        const tempUrl = res.fileList[0].tempFileURL;
        wx.setStorageSync(`avatar_url_${fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);
        this.setData({ avatarUrl: tempUrl, avatarLoading: false });
      } else {
        this.setData({ avatarLoading: false });
      }
    } catch (e) {
      console.error('获取头像临时 URL 失败:', e);
      this.setData({ avatarLoading: false });
    }
  },

  async onChooseAvatar(e: any) {
    const { avatarUrl } = e.detail;
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 上传到云存储
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarUrl,
      });

      if (uploadResult.fileID) {
        // 更新本地存储
        const userInfo = wx.getStorageSync('userInfo') || {};
        userInfo.avatarUrl = uploadResult.fileID;
        wx.setStorageSync('userInfo', userInfo);

        // 获取临时 URL 显示
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [uploadResult.fileID] });
        const tempUrl = tempRes.fileList?.[0]?.tempFileURL || avatarUrl;

        // 缓存临时 URL
        wx.setStorageSync(`avatar_url_${uploadResult.fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${uploadResult.fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);

        this.setData({ avatarUrl: tempUrl });

        // 同步到云端
        const app = getApp<IAppOption>();
        if (app) {
          await app.syncToCloud(0);
        }

        wx.showToast({ title: '头像已更新', icon: 'success' });
      }
    } catch (error) {
      console.error('上传头像失败:', error);
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