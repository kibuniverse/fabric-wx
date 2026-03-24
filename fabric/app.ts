// app.ts
App<IAppOption>({
  globalData: {
    totalKnittingTime: 0, // 全局针织总时长（毫秒）
    isSyncing: false, // 是否正在同步
  },

  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloudbase-7gipudlhe7a11395',
        traceUser: true,
      })
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    const info = wx.getSystemInfoSync()
    console.log('info', info)
  },

  /**
   * 累加针织时长到全局总时长
   * @param elapsedMs 经过的毫秒数
   */
  addKnittingTime(elapsedMs: number) {
    if (elapsedMs <= 0) return
    this.globalData.totalKnittingTime += elapsedMs

    // 同时更新本地存储
    const localTotal = wx.getStorageSync('total_zhizhi_time') || 0
    wx.setStorageSync('total_zhizhi_time', localTotal + elapsedMs)
  },

  /**
   * 获取针织总时长（毫秒）
   */
  getTotalKnittingTime(): number {
    return this.globalData.totalKnittingTime
  },

  /**
   * 从云端同步用户数据到本地
   */
  async syncFromCloud(): Promise<{ totalKnittingTime: number; zhizhiId: string; zhizhiIdModified: boolean; nickName: string; avatarUrl: string } | null> {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
      }) as any

      if (res.result && res.result.success && res.result.data) {
        const { totalKnittingTime, zhizhiId, zhizhiIdModified, nickName, avatarUrl } = res.result.data

        // 更新全局数据
        this.globalData.totalKnittingTime = totalKnittingTime || 0

        // 更新本地存储
        wx.setStorageSync('total_zhizhi_time', totalKnittingTime || 0)

        return { totalKnittingTime, zhizhiId, zhizhiIdModified, nickName, avatarUrl }
      }
      return null
    } catch (error) {
      console.error('从云端同步数据失败:', error)
      return null
    }
  },

  /**
   * 将本地数据同步到云端
   * @param elapsedMs 要累加的时长（毫秒）
   */
  async syncToCloud(elapsedMs: number = 0): Promise<boolean> {
    if (this.globalData.isSyncing) return false

    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isLoggedIn) return false

    this.globalData.isSyncing = true

    try {
      const res = await wx.cloud.callFunction({
        name: 'syncData',
        data: {
          totalKnittingTime: elapsedMs > 0 ? elapsedMs : 0,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          zhizhiId: userInfo.zhizhiId,
          zhizhiIdModified: userInfo.zhizhiIdModified,
        },
      }) as any

      this.globalData.isSyncing = false

      if (res.result && res.result.success) {
        // 更新本地存储的总时长
        if (res.result.data.totalKnittingTime !== undefined) {
          this.globalData.totalKnittingTime = res.result.data.totalKnittingTime
          wx.setStorageSync('total_zhizhi_time', res.result.data.totalKnittingTime)
        }
        return true
      }
      return false
    } catch (error) {
      this.globalData.isSyncing = false
      console.error('同步数据到云端失败:', error)
      return false
    }
  },
})