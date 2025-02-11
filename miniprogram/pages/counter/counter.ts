import { vibrate } from "../../utils/vibrate";

// pages/counter/counter.ts
const STORAGE_KEYS = {
  VIBRATION: 'counter_vibration_state',
  KEEP_SCREEN: 'counter_keep_screen_state',
  VOICE: 'counter_voice_state'
};

Page({
  data: {
    isVibrationOn: false,
    isKeepScreenOn: false,
    isVoiceOn: false,
  },

  onLoad() {
    // Load saved states from storage
    this.setData({
      isVibrationOn: wx.getStorageSync(STORAGE_KEYS.VIBRATION) || false,
      isKeepScreenOn: wx.getStorageSync(STORAGE_KEYS.KEEP_SCREEN) || false,
      isVoiceOn: wx.getStorageSync(STORAGE_KEYS.VOICE) || false
    });

    // Initialize keep screen state
    wx.setKeepScreenOn({
      keepScreenOn: this.data.isKeepScreenOn
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  showToast(message: string) {
    const toast = this.selectComponent('#toast');
    if (!toast) return;
    toast.showToast(message);
  },

  toggleVibration() {
    const newState = !this.data.isVibrationOn;
    this.setData({ isVibrationOn: newState });
    wx.setStorageSync(STORAGE_KEYS.VIBRATION, newState);
    this.showToast(newState ? "震动反馈已开启" : "震动反馈已关闭");
    if (newState) {
      vibrate()
    }
  },

  toggleVoice() {
    const newState = !this.data.isVoiceOn;
    this.setData({ isVoiceOn: newState });
    wx.setStorageSync(STORAGE_KEYS.VOICE, newState);
    this.showToast(newState ? "声音反馈已开启" : "声音反馈已关闭");
  },

  toggleKeepScreen() {
    const newState = !this.data.isKeepScreenOn;
    this.setData({ isKeepScreenOn: newState });
    wx.setStorageSync(STORAGE_KEYS.KEEP_SCREEN, newState);
    
    wx.setKeepScreenOn({
      keepScreenOn: newState
    });
    this.showToast(newState ? "屏幕常亮已开启" : "屏幕常亮已关闭");
  },

  handleCounterDelete() {
    // 可以在这里处理计数器删除后的逻辑
    console.log('Counter deleted');
  }
});