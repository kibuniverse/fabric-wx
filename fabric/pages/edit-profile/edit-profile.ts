// pages/edit-profile/edit-profile.ts

// 本地头像存储 key（与 me.ts 保持一致）
const LOCAL_AVATAR_PATH_KEY = 'local_avatar_path';
const LOCAL_AVATAR_FILE_ID_KEY = 'local_avatar_file_id';

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    zhizhiId: '',
    zhizhiIdModified: false,
  },

  // 下载锁，防止并发下载
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
      // 获取临时下载 URL
      const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const downloadUrl = res.fileList?.[0]?.tempFileURL;
      if (!downloadUrl) {
        throw new Error('获取临时URL失败');
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
      wx.setStorageSync(LOCAL_AVATAR_FILE_ID_KEY, fileID);

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
    if (!userInfo) return;

    const cloudAvatarUrl = userInfo.avatarUrl || '';

    // 优先使用本地持久化头像
    const localAvatarPath = this.getLocalAvatarPath();
    const localAvatarFileId = wx.getStorageSync(LOCAL_AVATAR_FILE_ID_KEY);

    let avatarUrl = '';
    if (localAvatarPath && localAvatarFileId === cloudAvatarUrl) {
      avatarUrl = localAvatarPath;
    } else if (cloudAvatarUrl.startsWith('cloud://')) {
      // 后台下载头像
      this.downloadAndSaveAvatar(cloudAvatarUrl).then((localPath) => {
        if (localPath) {
          this.setData({ avatarUrl: localPath });
        }
      });
    }

    this.setData({
      avatarUrl,
      nickName: userInfo.nickName || '微信用户',
      zhizhiId: userInfo.zhizhiId || '',
      zhizhiIdModified: userInfo.zhizhiIdModified || false,
    });
  },

  async onChooseAvatar(e: any) {
    const { avatarUrl: newAvatarPath } = e.detail;

    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 上传到云存储
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath,
        filePath: newAvatarPath,
      });

      if (uploadResult.fileID) {
        // 清除旧的本地头像文件
        this.clearLocalAvatar();

        // 更新本地存储
        const userInfo = wx.getStorageSync('userInfo') || {};
        userInfo.avatarUrl = uploadResult.fileID;
        wx.setStorageSync('userInfo', userInfo);

        // 下载并保存到本地
        const localPath = await this.downloadAndSaveAvatar(uploadResult.fileID);
        const displayUrl = localPath || newAvatarPath;

        this.setData({ avatarUrl: displayUrl });

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
    if (this.data.zhizhiIdModified) {
      wx.showToast({ title: '知织ID仅允许修改一次', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/edit-zhizhi-id/edit-zhizhi-id',
    });
  },
});