// app.ts

// 空闲超时时间（毫秒），10分钟
const KNITTING_IDLE_TIMEOUT = 10 * 60 * 1000;
// 心跳同步间隔时间（毫秒），3分钟
const HEARTBEAT_SYNC_INTERVAL = 3 * 60 * 1000;

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
    // 计数器心跳同步相关
    lastCounterSyncTime: 0, // 上次计数器同步时间
    counterHeartbeatTimer: 0, // 心跳定时器
    // 图解心跳同步相关
    lastDiagramSyncTime: 0, // 上次图解同步时间
    diagramHeartbeatTimer: 0, // 图解心跳定时器
    activeDiagramIds: [] as string[], // 当前打开的图解ID列表
    // 账号状态相关
    accountInvalidatedShown: false, // 账号失效弹窗是否已显示（防止重复弹窗）
    needRefreshMePage: false, // 是否需要刷新"我的"页面（账号失效后跳转时使用）
    // 图解预加载数据（登录时预加载，首页直接使用）
    preloadedDiagrams: [] as any[], // 预加载的图解数据
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

  /**
   * 预加载图解数据（登录时调用，加速首页显示）
   * 获取云端图解列表并缓存到 globalData
   */
  async preloadDiagrams(): Promise<void> {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return;
    }

    try {
      // 1. 调用云函数获取图解列表
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'download' }
      }) as any;

      if (!res.result?.success || !res.result?.data?.diagrams) {
        return;
      }

      const cloudDiagrams = res.result.data.diagrams;
      if (cloudDiagrams.length === 0) {
        return;
      }

      // 2. 批量获取所有封面的临时 URL
      const coverFileIds = cloudDiagrams
        .filter((item: any) => item.cover)
        .map((item: any) => item.cover);

      let tempUrlMap: Record<string, string> = {};
      if (coverFileIds.length > 0) {
        try {
          const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: coverFileIds });
          tempUrlRes.fileList?.forEach((item: any) => {
            if (item.tempFileURL) {
              tempUrlMap[item.fileID] = item.tempFileURL;
            }
          });
        } catch (e) {
          console.error('[App] 获取临时 URL 失败:', e);
        }
      }

      // 3. 构建预加载数据
      this.globalData.preloadedDiagrams = cloudDiagrams.map((cloudItem: any) => {
        const tempCoverUrl = tempUrlMap[cloudItem.cover] || '';
        return {
          id: cloudItem.id,
          name: cloudItem.name,
          originalName: cloudItem.originalName,
          path: tempCoverUrl,
          paths: [],
          type: cloudItem.type,
          createTime: cloudItem.createTime,
          cover: tempCoverUrl,
          size: cloudItem.size,  // 文件大小，用于去重
          syncStatus: 'synced',
          cloudId: cloudItem._id,
          cloudImages: cloudItem.images || [],
          cloudCover: cloudItem.cover
        };
      });

      // 4. 恢复计数器和备忘录数据到本地 Storage
      const countersStorage = wx.getStorageSync('simpleCounters') || {};
      const memosStorage = wx.getStorageSync('itemMemos') || {};
      cloudDiagrams.forEach((cloudItem: any) => {
        // 恢复计数器数据（如果云端有数据且本地没有）
        if (cloudItem.counterData && cloudItem.counterData.count !== undefined) {
          if (countersStorage[cloudItem.id] === undefined) {
            countersStorage[cloudItem.id] = cloudItem.counterData.count;
          }
        }
        // 恢复备忘录数据（如果云端有数据且本地没有）
        if (cloudItem.memoContent) {
          if (memosStorage[cloudItem.id] === undefined) {
            memosStorage[cloudItem.id] = cloudItem.memoContent;
          }
        }
      });
      wx.setStorageSync('simpleCounters', countersStorage);
      wx.setStorageSync('itemMemos', memosStorage);
      console.log('[App] 已恢复云端计数器和备忘录数据');

      console.log('[App] 预加载图解完成:', this.globalData.preloadedDiagrams.length);
    } catch (error) {
      console.error('[App] 预加载图解失败:', error);
    }
  },

  // ========== 账号状态管理 ==========

  /**
   * 处理账号失效（在其他设备被注销）
   * 显示弹窗提示用户，清除本地数据，跳转到"我的"页面
   */
  handleAccountInvalidated() {
    // 防止重复弹窗
    if (this.globalData.accountInvalidatedShown) {
      return;
    }
    this.globalData.accountInvalidatedShown = true;

    // 停止所有计时器和心跳
    this.stopKnittingIdleCheck();
    this.stopCounterHeartbeat();

    // 清除本地数据
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('total_zhizhi_time');
    this.globalData.totalKnittingTime = 0;
    this.resetLocalCountersToDefault();

    // 清除首页云端图解数据（保留未同步的本地图解）
    this.cleanupSyncedDiagramsForAccountInvalidation();

    // 清除本地头像存储
    const localAvatarPath = wx.getStorageSync('local_avatar_path');
    if (localAvatarPath) {
      try {
        wx.getFileSystemManager().unlinkSync(localAvatarPath);
      } catch (e) {
        console.warn('删除本地头像文件失败:', e);
      }
    }
    wx.removeStorageSync('local_avatar_path');
    wx.removeStorageSync('local_avatar_file_id');

    // 显示弹窗
    wx.showModal({
      title: '登录状态已失效',
      content: '您的账号已在其他设备注销，请重新登录',
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        // 不重置标志位，保持 accountInvalidatedShown = true
        // 直到用户重新登录后才会在 login 云函数成功后重置
        // 设置标志位，通知 me 页面刷新
        this.globalData.needRefreshMePage = true;
        // 跳转到"我的"页面
        wx.switchTab({ url: '/pages/me/me' });
      }
    });
  },

  /**
   * 检查云函数返回结果是否表示账号失效
   * @param result 云函数返回结果
   * @returns 是否账号失效
   */
  isAccountInvalidated(result: any): boolean {
    if (!result) return false;
    // 用户不存在 = 账号已被注销
    if (result.error === '用户不存在' || result.error === '用户不存在，请先登录') {
      return true;
    }
    return false;
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
    // 检查是否已登录，未登录不调用云函数
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return null;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
      }) as any

      // 检查账号是否失效（在其他设备被注销）
      if (res.result && !res.result.success && this.isAccountInvalidated(res.result)) {
        this.handleAccountInvalidated();
        return null;
      }

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
   * @returns 同步结果，包含 success 和可能的 error 信息
   */
  async syncToCloud(elapsedMs: number = 0): Promise<{ success: boolean; error?: string }> {
    if (this.globalData.isSyncing) return { success: false }

    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isLoggedIn) return { success: false }

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

      // 检查账号是否失效（在其他设备被注销）
      if (res.result && !res.result.success && this.isAccountInvalidated(res.result)) {
        this.handleAccountInvalidated();
        return { success: false };
      }

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
        return { success: true }
      }

      // 返回云函数的错误信息
      return { success: false, error: res.result?.error }
    } catch (error) {
      this.globalData.isSyncing = false
      console.error('同步数据到云端失败:', error)
      return { success: false }
    }
  },

  /**
   * 强制同步针织总时长到云端（使用 max 策略）
   * 用于退出登录等场景，确保本地总时长不丢失
   */
  async forceSyncTotalKnittingTime(): Promise<boolean> {
    if (this.globalData.isSyncing) {
      // 等待当前同步完成（最多等待5秒）
      const maxWaitTime = 5000
      const startTime = Date.now()
      while (this.globalData.isSyncing && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isLoggedIn) return false

    this.globalData.isSyncing = true

    try {
      const localTime = this.globalData.totalKnittingTime
      console.log(`[forceSyncTotalKnittingTime] 上传本地总时长: ${localTime}ms`)

      const res = await wx.cloud.callFunction({
        name: 'syncData',
        data: {
          totalKnittingTimeAbsolute: localTime, // 使用绝对值模式
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          zhizhiId: userInfo.zhizhiId,
          zhizhiIdModified: userInfo.zhizhiIdModified,
        },
      }) as any

      this.globalData.isSyncing = false

      // 检查账号是否失效（在其他设备被注销）
      if (res.result && !res.result.success && this.isAccountInvalidated(res.result)) {
        this.handleAccountInvalidated();
        return false;
      }

      if (res.result && res.result.success) {
        const cloudTime = res.result.data.totalKnittingTime
        console.log(`[forceSyncTotalKnittingTime] 云端结果: ${cloudTime}ms`)
        return true
      }
      return false
    } catch (error) {
      this.globalData.isSyncing = false
      console.error('[forceSyncTotalKnittingTime] 同步失败:', error)
      return false
    }
  },

  // ========== 计数器云同步 ==========

  /**
   * 启动计数器心跳同步
   */
  startCounterHeartbeat() {
    this.stopCounterHeartbeat();
    this.globalData.lastCounterSyncTime = Date.now();

    this.globalData.counterHeartbeatTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.globalData.lastCounterSyncTime;

      if (elapsed >= HEARTBEAT_SYNC_INTERVAL) {
        this.syncCounterData('sync');
      }
    }, 60000) as unknown as number; // 每分钟检查一次
  },

  /**
   * 停止计数器心跳同步
   */
  stopCounterHeartbeat() {
    if (this.globalData.counterHeartbeatTimer) {
      clearInterval(this.globalData.counterHeartbeatTimer);
      this.globalData.counterHeartbeatTimer = 0;
    }
  },

  /**
   * 重置心跳计时器（用户有操作时调用）
   */
  resetCounterHeartbeat() {
    this.globalData.lastCounterSyncTime = Date.now();
  },

  /**
   * 强制同步计数器数据到云端（等待当前同步完成后再执行）
   * 用于确保用户离开页面时数据不会丢失
   * @param action 'upload' | 'download' | 'sync'
   */
  async forceSyncCounterData(action: 'upload' | 'download' | 'sync'): Promise<boolean> {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return false;
    }

    // 等待当前同步完成（最多等待5秒）
    const maxWaitTime = 5000;
    const startTime = Date.now();
    while (this.globalData.isSyncing && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 执行同步
    return this.syncCounterData(action);
  },

  /**
   * 同步计数器数据到云端
   * @param action 'upload' | 'download' | 'sync'
   */
  async syncCounterData(action: 'upload' | 'download' | 'sync'): Promise<boolean> {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return false;
    }

    if (this.globalData.isSyncing) {
      return false;
    }
    this.globalData.isSyncing = true;

    try {
      // 获取本地计数器数据
      const counterKeys = wx.getStorageSync('counter_keys') || [];
      const counters: Record<string, any> = {};

      // 读取每个计数器的完整数据
      for (const key of counterKeys) {
        const counterData = wx.getStorageSync(key);
        if (counterData) {
          counters[key] = {
            ...counterData,
            updatedAt: counterData.updatedAt || Date.now()
          };
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'syncCounterData',
        data: {
          action,
          counterKeys,  // 只传 keys 数组
          counters,
        },
      }) as any;

      this.globalData.isSyncing = false;
      this.globalData.lastCounterSyncTime = Date.now();

      // 检查账号是否失效（在其他设备被注销）
      if (res.result && !res.result.success && this.isAccountInvalidated(res.result)) {
        this.handleAccountInvalidated();
        return false;
      }

      if (res.result && res.result.success) {
        // 如果是下载或同步，更新本地数据
        if ((action === 'download' || action === 'sync') && res.result.data) {
          const { counterKeys: cloudKeys, counters: cloudCounters } = res.result.data;

          // 获取本地当前的计数器 keys（用于对比删除）
          const localKeys = wx.getStorageSync('counter_keys') || [];

          // 兼容旧格式：确保 cloudKeys 是字符串数组
          // 旧格式可能是 [{key: 'xxx', title: '计数器名'}] 或 [{key: 'xxx'}]
          const cloudKeysList = (cloudKeys || []).map((k: any) => {
            if (typeof k === 'string') {
              return k;
            }
            // 旧格式对象，取 key 字段
            return k.key || k;
          });

          // 构建云端 keys 的 Set
          const cloudKeysSet = new Set(cloudKeysList);

          // 删除本地多余的计数器数据（云端已删除的）
          for (const key of localKeys) {
            if (!cloudKeysSet.has(key)) {
              wx.removeStorageSync(key);
            }
          }

          // 更新本地 counterKeys（只存储字符串数组）
          wx.setStorageSync('counter_keys', cloudKeysList);

          // 更新云端返回的计数器数据
          if (cloudCounters && Object.keys(cloudCounters).length > 0) {
            for (const key of Object.keys(cloudCounters)) {
              const counterData = cloudCounters[key];
              // 确保 name 字段存在（兼容可能缺失 name 的旧数据）
              if (!counterData.name) {
                counterData.name = '默认计数器';
              }
              wx.setStorageSync(key, counterData);
            }
          }
        }
        return true;
      }
      return false;
    } catch (error) {
      this.globalData.isSyncing = false;
      console.error('同步计数器数据失败:', error);
      return false;
    }
  },

  /**
   * 从云端获取计数器数据
   */
  async fetchCounterDataFromCloud(): Promise<{ counterKeys: any[]; counters: Record<string, any> } | null> {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return null;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'syncCounterData',
        data: { action: 'download' },
      }) as any;

      if (res.result && res.result.success && res.result.data) {
        return {
          counterKeys: res.result.data.counterKeys || [],
          counters: res.result.data.counters || {},
        };
      }
      return null;
    } catch (error) {
      console.error('获取云端计数器数据失败:', error);
      return null;
    }
  },

  /**
   * 检查本地临时默认计数器是否被修改过（未登录状态下使用的计数器）
   */
  isDefaultCounterModified(): boolean {
    const defaultData = {
      name: "默认计数器",
      targetCount: 999,
      currentCount: 0,
      history: [],
      timerState: {
        startTimestamp: 0,
        elapsedTime: 0,
        wasRunning: false,
      },
      memo: "",
    };

    // 检查未登录状态下的临时计数器
    const savedData = wx.getStorageSync('local_default_counter');
    if (!savedData) return false;

    // 检查是否有实质性的修改
    return (
      savedData.currentCount !== 0 ||
      savedData.targetCount !== 999 ||
      savedData.name !== "默认计数器" ||
      (savedData.history && savedData.history.length > 0) ||
      (savedData.memo && savedData.memo.length > 0) ||
      (savedData.timerState && savedData.timerState.elapsedTime > 0)
    );
  },

  /**
   * 退出登录时重置本地计数器（云端数据仍存在）
   * 只清除本地数据，不清除迁移标记，下次登录只需从云端下载
   */
  resetLocalCountersForLogout() {
    // 清除本地计数器数据（云端数据仍存在）
    const counterKeys = wx.getStorageSync('counter_keys') || [];
    for (const key of counterKeys) {
      wx.removeStorageSync(key);
    }
    wx.removeStorageSync('counter_keys');
    wx.removeStorageSync('local_default_counter');
    
    // 创建全新的本地默认计数器（使用 local_default_counter 作为 key）
    const defaultKeys = ["local_default_counter"];
    const defaultData = {
      name: "默认计数器",
      targetCount: 999,
      currentCount: 0,
      startTime: 0,
      history: [],
      timerState: {
        startTimestamp: 0,
        elapsedTime: 0,
        wasRunning: false,
      },
      memo: "",
      updatedAt: Date.now(), // 初始化时设置时间戳
    };

    wx.setStorageSync('counter_keys', defaultKeys);
    wx.setStorageSync('local_default_counter', defaultData);
  },

  /**
   * 重置本地计数器为默认状态（用于注销账号后）
   * 使用 local_default_counter 作为 key，与云端数据完全隔离
   */
  resetLocalCountersToDefault() {
    // 清除所有计数器相关数据
    const counterKeys = wx.getStorageSync('counter_keys') || [];
    for (const key of counterKeys) {
      wx.removeStorageSync(key);
    }
    wx.removeStorageSync('counter_keys');
    // 清除可能存在的临时计数器
    wx.removeStorageSync('local_default_counter');
    // 清除迁移标记（注销后重新登录需要重新处理数据）
    wx.removeStorageSync('counter_migrated');

    // 创建全新的本地默认计数器（使用 local_default_counter 作为 key）
    const defaultKeys = ["local_default_counter"];
    const defaultData = {
      name: "默认计数器",
      targetCount: 999,
      currentCount: 0,
      startTime: 0,
      history: [],
      timerState: {
        startTimestamp: 0,
        elapsedTime: 0,
        wasRunning: false,
      },
      memo: "",
      updatedAt: Date.now(), // 初始化时设置时间戳
    };

    wx.setStorageSync('counter_keys', defaultKeys);
    wx.setStorageSync('local_default_counter', defaultData);
  },

  /**
   * 账号失效时清理已同步的图解数据
   * 保留未同步数据（syncStatus='local'），删除已同步数据
   * 因为云端数据已删除，已同步的图解无法再打开
   */
  cleanupSyncedDiagramsForAccountInvalidation() {
    const imageList = wx.getStorageSync('imageList') || [];
    const fileList = wx.getStorageSync('fileList') || [];

    // 删除已同步的本地文件
    for (const item of imageList) {
      if (item.syncStatus === 'synced') {
        this.removeDiagramFiles(item);
      }
    }
    for (const item of fileList) {
      if (item.syncStatus === 'synced') {
        this.removeDiagramFiles(item);
      }
    }

    // 保留未同步数据
    const remainingImages = imageList.filter((i: any) => i.syncStatus === 'local');
    const remainingFiles = fileList.filter((i: any) => i.syncStatus === 'local');

    wx.setStorageSync('imageList', remainingImages);
    wx.setStorageSync('fileList', remainingFiles);
  },

  /**
   * 删除图解关联的所有本地文件
   */
  removeDiagramFiles(item: any) {
    // 删除图片文件
    if (item.paths && item.paths.length > 0) {
      item.paths.forEach((filePath: string) => {
        wx.removeSavedFile({
          filePath,
          success: () => console.log('删除图片成功:', filePath),
          fail: (err: any) => console.error('删除图片失败:', filePath, err)
        });
      });
    }
    // 删除封面文件（如果与 paths 不同）
    if (item.cover && item.cover !== item.paths?.[0]) {
      wx.removeSavedFile({
        filePath: item.cover,
        success: () => console.log('删除封面成功:', item.cover),
        fail: (err: any) => console.error('删除封面失败:', item.cover, err)
      });
    }
    // 删除 PDF 源文件
    if (item.pdfSourcePath) {
      wx.removeSavedFile({
        filePath: item.pdfSourcePath,
        success: () => console.log('删除PDF源文件成功:', item.pdfSourcePath),
        fail: (err: any) => console.error('删除PDF源文件失败:', item.pdfSourcePath, err)
      });
    }
  },

  /**
   * 检测是否需要执行计数器迁移
   * 迁移是一次性操作，迁移后设置标记，不再重复执行
   *
   * 排除场景：只有 local_default_counter 的情况
   * - 注销账号后重新登录：counter_keys 只有 local_default_counter，不应触发迁移
   * - 退出登录后重新登录：counter_migrated 标记存在，不会触发迁移
   */
  isOldUserMigration(): boolean {
    // 已迁移过，不再执行
    if (wx.getStorageSync('counter_migrated')) return false;

    const keys = wx.getStorageSync('counter_keys') || [];

    // 只有 local_default_counter，不触发迁移（可能是注销后的新状态）
    if (keys.length === 1 && keys[0] === 'local_default_counter') {
      return false;
    }

    // 有计数器数据（且不是只有 local_default_counter）需要迁移
    // 迁移后设置标记，下次不再执行
    return keys.length > 0;
  },

  /**
   * 处理老用户升级时的计数器迁移
   * 将本地所有计数器合并到云端（两边都保留）
   * 注意：local_default_counter 是未登录临时计数器，需要转换为正式计数器
   */
  async handleOldUserMigration(): Promise<void> {
    // 1. 获取所有本地计数器
    const localKeys = wx.getStorageSync('counter_keys') || [];
    const localCounters: Record<string, any> = {};
    for (const key of localKeys) {
      const data = wx.getStorageSync(key);
      if (data) {
        localCounters[key] = { ...data, updatedAt: data.updatedAt || Date.now() };
      }
    }

    // 2. 也检查 local_default_counter（可能并存）
    const localDefaultData = wx.getStorageSync('local_default_counter');
    if (localDefaultData && this.isDefaultCounterModified()) {
      if (!localKeys.includes('local_default_counter')) {
        localKeys.push('local_default_counter');
        localCounters['local_default_counter'] = localDefaultData;
      }
    }

    // 3. 获取云端数据
    const cloudData = await this.fetchCounterDataFromCloud();

    // 4. 处理 local_default_counter：转换为正式计数器
    let finalKeys: string[] = [];
    const finalCounters: Record<string, any> = {};

    if (cloudData) {
      // 云端有数据：合并（两边都保留）
      const { counterKeys: cloudKeys, counters: cloudCounters } = cloudData;
      const normalizedCloudKeys = (cloudKeys || []).map((k: any) => typeof k === 'string' ? k : k.key);

      finalKeys = [...normalizedCloudKeys];
      for (const key of normalizedCloudKeys) {
        if (cloudCounters && cloudCounters[key]) {
          finalCounters[key] = cloudCounters[key];
        }
      }
    }

    // 处理本地计数器（排除 local_default_counter，它需要特殊处理）
    for (const key of localKeys) {
      if (key === 'local_default_counter') {
        // local_default_counter 转换为正式计数器
        if (localCounters['local_default_counter']) {
          const timestamp = Date.now();
          const newKey = `counter_${timestamp}`;
          finalKeys.push(newKey);
          finalCounters[newKey] = {
            ...localCounters['local_default_counter'],
            updatedAt: timestamp,
          };
        }
      } else if (finalKeys.includes(key)) {
        // 冲突：本地计数器改名，添加后缀
        const newKey = `${key}_${Date.now()}`;
        finalKeys.push(newKey);
        finalCounters[newKey] = {
          ...localCounters[key],
          name: localCounters[key]?.name === finalCounters[key]?.name
            ? `${localCounters[key].name} (本地)`
            : localCounters[key]?.name || '默认计数器',
          updatedAt: Date.now()
        };
      } else {
        // 不冲突：直接添加
        finalKeys.push(key);
        finalCounters[key] = localCounters[key];
      }
    }

    // 5. 上传数据
    if (finalKeys.length > 0) {
      try {
        await wx.cloud.callFunction({
          name: 'syncCounterData',
          data: { action: 'upload', counterKeys: finalKeys, counters: finalCounters }
        });
      } catch (error) {
        console.error('[handleOldUserMigration] 上传计数器数据失败:', error);
      }

      // 6. 更新本地数据（无论上传是否成功，都更新本地）
      wx.setStorageSync('counter_keys', finalKeys);
      for (const key of Object.keys(finalCounters)) {
        wx.setStorageSync(key, finalCounters[key]);
      }
    }

    // 7. 清除临时计数器和设置迁移标记
    wx.removeStorageSync('local_default_counter');
    wx.setStorageSync('counter_migrated', true);
  },

  /**
   * 用户登录时处理数据合并
   * 核心逻辑：
   * 1. 如果是老用户升级场景，处理多计数器迁移
   * 2. 如果本地有修改过的临时计数器（local_default_counter），将其作为新计数器保存到云端
   * 3. 然后加载云端原有的数据到本地
   */
  async handleLoginDataMerge(): Promise<boolean> {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return false;
    }

    // 检测老用户升级场景
    if (this.isOldUserMigration()) {
      await this.handleOldUserMigration();
      return true;
    }

    // 检查本地临时计数器是否被修改过
    const localModified = this.isDefaultCounterModified();

    // 获取云端数据
    const cloudData = await this.fetchCounterDataFromCloud();

    if (!cloudData) {
      // 云端没有数据
      if (localModified) {
        // 本地有修改，将临时计数器转为正式计数器并上传
        await this.saveLocalCounterToCloud();
      }
      return true;
    }

    // 云端有数据
    const { counterKeys: cloudKeys, counters: cloudCounters } = cloudData;

    // 兼容旧格式：确保 cloudKeys 是字符串数组
    const normalizedCloudKeys = (cloudKeys || []).map((k: any) => {
      if (typeof k === 'string') {
        return k;
      }
      return k.key || k;
    });

    // 如果本地有修改，先将临时计数器作为新计数器保存到云端
    if (localModified) {
      await this.saveLocalCounterToCloud(normalizedCloudKeys, cloudCounters);
    }

    // 加载云端数据到本地（覆盖临时计数器）
    if (normalizedCloudKeys.length > 0) {
      // 先清除本地临时计数器数据
      wx.removeStorageSync('local_default_counter');

      // 存储 counterKeys（只存储字符串数组）
      wx.setStorageSync('counter_keys', normalizedCloudKeys);
      for (const key of Object.keys(cloudCounters || {})) {
        const counterData = cloudCounters[key];
        // 确保 name 字段存在
        if (!counterData.name) {
          counterData.name = '默认计数器';
        }
        wx.setStorageSync(key, counterData);
      }
    }

    return true;
  },

  /**
   * 将本地临时计数器保存到云端作为新计数器
   * @param existingKeys 已有的云端计数器 keys（可选）
   * @param existingCounters 已有的云端计数器数据（可选）
   */
  async saveLocalCounterToCloud(existingKeys?: string[], existingCounters?: Record<string, any>): Promise<void> {
    const localData = wx.getStorageSync('local_default_counter');
    if (!localData) return;

    // 创建新的计数器，使用唯一 key
    const timestamp = Date.now();
    const newKey = `counter_${timestamp}`;
    const newData = {
      ...localData,
      updatedAt: timestamp,
    };

    // 准备上传数据
    let mergedKeys = existingKeys || [];
    let mergedCounters = existingCounters || {};

    // 添加新计数器（只存 key）
    mergedKeys = [...mergedKeys, newKey];
    mergedCounters[newKey] = newData;

    // 上传到云端
    try {
      await wx.cloud.callFunction({
        name: 'syncCounterData',
        data: {
          action: 'upload',
          counterKeys: mergedKeys,
          counters: mergedCounters,
        },
      });
    } catch (error) {
      console.error('保存本地计数器到云端失败:', error);
    }

    // 清除本地临时计数器
    wx.removeStorageSync('local_default_counter');
  },

  // ========== 图解心跳同步 ==========

  /**
   * 启动图解心跳同步
   */
  startDiagramHeartbeat() {
    this.stopDiagramHeartbeat();
    this.globalData.lastDiagramSyncTime = Date.now();

    this.globalData.diagramHeartbeatTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.globalData.lastDiagramSyncTime;

      if (elapsed >= HEARTBEAT_SYNC_INTERVAL) {
        this.syncDiagramCounterData();
      }
    }, 60000) as unknown as number; // 每分钟检查一次
  },

  /**
   * 停止图解心跳同步
   */
  stopDiagramHeartbeat() {
    if (this.globalData.diagramHeartbeatTimer) {
      clearInterval(this.globalData.diagramHeartbeatTimer);
      this.globalData.diagramHeartbeatTimer = 0;
    }
  },

  /**
   * 重置图解心跳计时器（用户有操作时调用）
   */
  resetDiagramHeartbeat() {
    this.globalData.lastDiagramSyncTime = Date.now();
  },

  /**
   * 强制同步图解数据到云端（等待当前同步完成后再执行）
   * 用于确保用户离开页面时数据不会丢失
   * @param diagramId 图解ID，不传则同步所有活跃图解
   */
  async forceSyncDiagramCounterData(diagramId?: string): Promise<boolean> {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return false;
    }

    // 等待当前同步完成（最多等待5秒）
    const maxWaitTime = 5000;
    const startTime = Date.now();
    while (this.globalData.isSyncing && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 执行同步
    return this.syncDiagramCounterData(diagramId);
  },

  /**
   * 同步图解的计数器和备忘录数据
   * @param diagramId 图解ID，不传则同步所有活跃图解
   */
  async syncDiagramCounterData(diagramId?: string): Promise<boolean> {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      return false;
    }

    if (this.globalData.isSyncing) {
      return false;
    }
    this.globalData.isSyncing = true;

    try {
      // 获取要同步的图解ID列表
      const diagramIds = diagramId ? [diagramId] : this.globalData.activeDiagramIds || [];

      if (diagramIds.length === 0) {
        this.globalData.isSyncing = false;
        return true;
      }

      const countersStorage = wx.getStorageSync('simpleCounters') || {};
      const memosStorage = wx.getStorageSync('itemMemos') || {};

      for (const id of diagramIds) {
        const counterData = {
          count: countersStorage[id] || 0,
          updatedAt: Date.now()
        };
        const memoContent = memosStorage[id] || '';

        await wx.cloud.callFunction({
          name: 'syncDiagramData',
          data: {
            action: 'updateInfo',
            diagramId: id,
            counterData,
            memoContent
          }
        });
      }

      this.globalData.isSyncing = false;
      this.globalData.lastDiagramSyncTime = Date.now();
      console.log('[Diagram] 同步图解计数器数据成功');
      return true;
    } catch (error) {
      this.globalData.isSyncing = false;
      console.error('[Diagram] 同步图解计数器数据失败:', error);
      return false;
    }
  },
})