/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    totalKnittingTime: number, // 全局针织总时长（毫秒）
    isSyncing: boolean, // 是否正在同步
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  addKnittingTime(elapsedMs: number): void,
  getTotalKnittingTime(): number,
  syncFromCloud(): Promise<{ totalKnittingTime: number; zhizhiId: string; nickName: string; avatarUrl: string } | null>,
  syncToCloud(elapsedMs?: number): Promise<boolean>,
}