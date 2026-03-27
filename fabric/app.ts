// app.ts

// 空闲超时时间（毫秒），10分钟
const KNITTING_IDLE_TIMEOUT = 10 * 60 * 1000;

App<IAppOption>({
  globalData: {
    totalKnittingTime: 0, // 全局针织总时长（毫秒）
    isSyncing: false, // 是否正在同步
    // 针织时长计时相关
    knittingSessionStart: 0, // 当前会话开始时间
    knittingSessionElapsed: 0, // 当前会话已累计时长
    isKnittingTimerRunning: false, // 计时器是否运行中
    knittingIdleTimer: 0, // 空闲检测定时器
    lastKnittingActivity: 0, // 最后活跃时间
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

    // 初始化总时长
    this.globalData.totalKnittingTime = wx.getStorageSync('total_zhizhi_time') || 0

    // 如果已登录，从云端同步最新数据（多设备同步）
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.isLoggedIn) {
      this.syncFromCloud().catch(err => {
        console.error('[App] 冷启动同步云端数据失败:', err)
      })
    }
  },

  // ========== 针织总时长计时器 ==========

  /**
   * 开始针织计时会话
   */
  startKnittingSession() {
    // 未登录不计时
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isLoggedIn) {
      console.log('[KnittingTimer] 未登录，不启动计时')
      return
    }

    // 如果已在计时，只重置活跃时间
    if (this.globalData.isKnittingTimerRunning) {
      this.resetKnittingActivity()
      return
    }

    const now = Date.now()
    this.globalData.knittingSessionStart = now
    this.globalData.knittingSessionElapsed = 0
    this.globalData.isKnittingTimerRunning = true
    this.globalData.lastKnittingActivity = now

    // 启动空闲检测
    this.startKnittingIdleCheck()

    console.log('[KnittingTimer] 开始计时')
  },

  /**
   * 暂停针织计时会话
   * @param syncToCloud 是否同步到云端
   */
  pauseKnittingSession(syncToCloud: boolean = true) {
    if (!this.globalData.isKnittingTimerRunning) return

    // 计算本次会话时长
    const sessionTime = this.getCurrentKnittingSessionTime()
    this.globalData.knittingSessionElapsed = sessionTime
    this.globalData.isKnittingTimerRunning = false
    this.globalData.knittingSessionStart = 0

    // 停止空闲检测
    this.stopKnittingIdleCheck()

    // 累加到总时长
    if (sessionTime > 0) {
      this.addKnittingTime(sessionTime)
      console.log(`[KnittingTimer] 暂停，本次时长: ${Math.round(sessionTime / 1000)}秒`)

      // 同步到云端
      if (syncToCloud) {
        this.syncToCloud(sessionTime)
      }
    }
  },

  /**
   * 获取当前会话已计时时长（毫秒）
   */
  getCurrentKnittingSessionTime(): number {
    if (!this.globalData.isKnittingTimerRunning) {
      return this.globalData.knittingSessionElapsed
    }
    return this.globalData.knittingSessionElapsed + (Date.now() - this.globalData.knittingSessionStart)
  },

  /**
   * 重置活跃时间（用户有操作时调用）
   */
  resetKnittingActivity() {
    this.globalData.lastKnittingActivity = Date.now()
  },

  /**
   * 启动空闲检测
   */
  startKnittingIdleCheck() {
    this.stopKnittingIdleCheck()

    this.globalData.knittingIdleTimer = setInterval(() => {
      const lastActivity = this.globalData.lastKnittingActivity
      const idleTime = Date.now() - lastActivity

      if (idleTime >= KNITTING_IDLE_TIMEOUT) {
        console.log('[KnittingTimer] 空闲超时，自动暂停')
        this.pauseKnittingSession(true)
      }
    }, 60000) as unknown as number // 每分钟检查一次
  },

  /**
   * 停止空闲检测
   */
  stopKnittingIdleCheck() {
    if (this.globalData.knittingIdleTimer) {
      clearInterval(this.globalData.knittingIdleTimer)
      this.globalData.knittingIdleTimer = 0
    }
  },

  /**
   * 检查计时器是否运行中
   */
  isKnittingTimerRunning(): boolean {
    return this.globalData.isKnittingTimerRunning
  },

  // ========== 原有的时长管理方法 ==========

  /**
   * 累加针织时长到全局总时长
   * @param elapsedMs 经过的毫秒数
   */
  addKnittingTime(elapsedMs: number) {
    if (elapsedMs <= 0) return

    // 未登录不累加时长
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isLoggedIn) {
      console.log('[KnittingTimer] 未登录，不累加时长')
      return
    }

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

        // 【修复】使用 max 策略，保留较大的值（避免旧数据覆盖新数据）
        const localTime = this.globalData.totalKnittingTime
        const maxTime = Math.max(totalKnittingTime || 0, localTime)

        // 更新全局数据
        this.globalData.totalKnittingTime = maxTime

        // 更新本地存储
        wx.setStorageSync('total_zhizhi_time', maxTime)

        return { totalKnittingTime: maxTime, zhizhiId, zhizhiIdModified, nickName, avatarUrl }
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
          const cloudTime = res.result.data.totalKnittingTime
          const localTime = this.globalData.totalKnittingTime

          // 【修复】只有云端数据更大时才更新（避免旧数据覆盖新数据）
          if (cloudTime > localTime) {
            this.globalData.totalKnittingTime = cloudTime
            wx.setStorageSync('total_zhizhi_time', cloudTime)
          }
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