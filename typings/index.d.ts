/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    totalKnittingTime: number, // 全局针织总时长（毫秒）
    isSyncing: boolean, // 是否正在同步
    // 针织总时长计时器相关
    knittingSessionStart: number, // 当前会话开始时间戳
    knittingSessionElapsed: number, // 当前会话已累计时长
    isKnittingTimerRunning: boolean, // 计时器是否运行中
    knittingIdleTimer: number, // 空闲检测定时器
    lastKnittingActivity: number, // 最后活跃时间戳
    // 计数器心跳同步相关
    lastCounterSyncTime: number, // 上次计数器同步时间
    counterHeartbeatTimer: number, // 心跳定时器
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  addKnittingTime(elapsedMs: number): void,
  getTotalKnittingTime(): number,
  syncFromCloud(): Promise<{ totalKnittingTime: number; zhizhiId: string; zhizhiIdModified: boolean; nickName: string; avatarUrl: string } | null>,
  syncToCloud(elapsedMs?: number): Promise<boolean>,
  // 针织总时长计时器方法
  startKnittingSession(): void,
  pauseKnittingSession(syncToCloud?: boolean): void,
  getCurrentKnittingSessionTime(): number,
  resetKnittingActivity(): void,
  startKnittingIdleCheck(): void,
  stopKnittingIdleCheck(): void,
  isKnittingTimerRunning(): boolean,
  // 计数器云同步方法
  startCounterHeartbeat(): void,
  stopCounterHeartbeat(): void,
  resetCounterHeartbeat(): void,
  syncCounterData(action: 'upload' | 'download' | 'sync'): Promise<boolean>,
  forceSyncCounterData(action: 'upload' | 'download' | 'sync'): Promise<boolean>,
  fetchCounterDataFromCloud(): Promise<{ counterKeys: any[]; counters: Record<string, any> } | null>,
  isDefaultCounterModified(): boolean,
  resetLocalCountersToDefault(): void,
  handleLoginDataMerge(): Promise<boolean>,
  saveLocalCounterToCloud(existingKeys?: any[], existingCounters?: Record<string, any>): Promise<void>,
}