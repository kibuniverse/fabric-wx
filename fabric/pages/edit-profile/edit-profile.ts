// pages/edit-profile/edit-profile.ts

// 本地头像存储 key（与 me.ts 保持一致）
const LOCAL_AVATAR_PATH_KEY = 'local_avatar_path';
const LOCAL_AVATAR_FILE_ID_KEY = 'local_avatar_file_id';

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    zhizhiId: '',
    avatarLoading: false,
  },

  // 请求锁，防止并发重复请求
  _isRefreshingAvatar: false,
  _isDownloadingAvatar: false,

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
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
   * 下载并保存头像到本地持久化存储
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

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      const cloudAvatarUrl = userInfo.avatarUrl || '';
      let avatarUrl = cloudAvatarUrl;

      // 优先使用本地持久化头像
      const localAvatarPath = this.getLocalAvatarPath();
      const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

      if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
        avatarUrl = localAvatarPath;
      } else if (cloudAvatarUrl.startsWith('cloud://')) {
        const cachedUrl = wx.getStorageSync(`avatar_url_${cloudAvatarUrl}`);
        const expireTime = wx.getStorageSync(`avatar_expire_${cloudAvatarUrl}`);

        if (cachedUrl && expireTime && Date.now() < expireTime) {
          avatarUrl = cachedUrl;
        } else {
          if (cachedUrl) {
            avatarUrl = cachedUrl;
          }
          this.refreshAvatarCache(cloudAvatarUrl);
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
        // 清理旧头像缓存和本地文件
        if (oldAvatarUrl && oldAvatarUrl.startsWith('cloud://')) {
          wx.removeStorageSync(`avatar_url_${oldAvatarUrl}`);
          wx.removeStorageSync(`avatar_expire_${oldAvatarUrl}`);
        }
        // 清除旧的本地头像文件
        this.clearLocalAvatar();

        // 更新本地存储
        userInfo.avatarUrl = uploadResult.fileID;
        wx.setStorageSync('userInfo', userInfo);

        // 获取临时 URL 显示
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [uploadResult.fileID] });
        const tempUrl = tempRes.fileList?.[0]?.tempFileURL || newAvatarPath;

        // 缓存临时 URL
        wx.setStorageSync(`avatar_url_${uploadResult.fileID}`, tempUrl);
        wx.setStorageSync(`avatar_expire_${uploadResult.fileID}`, Date.now() + 1.5 * 60 * 60 * 1000);

        // 下载并保存到本地持久化存储
        const localPath = await this.downloadAndSaveAvatar(uploadResult.fileID);
        const displayUrl = localPath || tempUrl;

        this.setData({ avatarUrl: displayUrl, avatarLoading: false });

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