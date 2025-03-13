import { vibrate } from "../../utils/vibrate";

// pages/counter/counter.ts
const STORAGE_KEYS = {
  VIBRATION: 'counter_vibration_state',
  KEEP_SCREEN: 'counter_keep_screen_state',
  VOICE: 'counter_voice_state',
  COUNTER_KEYS: 'counter_keys',
  ACTIVE_KEY: 'counter_active_key'
};

const defaultCounterKeys = [
  { key: 'default_counter', title: '默认计数器' },
  { key: 'default_counter_1', title: '默认计数器1' }
]

Page({
  data: {
    isVibrationOn: false,
    isKeepScreenOn: false,
    isVoiceOn: false,
    // 增加计数器key列表
    counterKeys: [] as { key: string, name: string }[],
    activeKey: '',
    activeTab: 0
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const tabBarHeight = systemInfo.screenHeight - systemInfo.safeArea.height;
    console.log('tabBar高度为：', tabBarHeight);
    const keys = wx.getStorageSync(STORAGE_KEYS.COUNTER_KEYS) || defaultCounterKeys;
    this.setData({ counterKeys: keys });
    console.log('keys', keys);
    const activeKey = wx.getStorageSync(STORAGE_KEYS.ACTIVE_KEY);
    this.setData({ activeKey });
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
  onTabClick(e) {
    const index = e.detail.index
    this.setData({
      activeTab: index
    })
  },

  onChange(e) {
    const index = e.detail.index
    this.setData({
      activeTab: index
    })
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

  handleCounterDelete(e: { detail: { id: string } }) {
    // 添加确认删除计数器的弹窗
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个计数器吗？',
      confirmText: '删除',
      confirmColor: '#FF0000',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 用户点击了确认按钮
          // 如果只剩余了一个计时器，则提示不能删除
          const counterKeys = this.data.counterKeys;
          if (counterKeys.length === 1) {
            wx.showToast({
              title: '不能删除最后一个计数器',
              icon: 'none'
            });
            return;
          }

          // 删除 counterkeys中的key
          const newCounterKeys = this.data.counterKeys.filter(key => key.key !== e.detail.id);
          wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);
          this.setData({ counterKeys: newCounterKeys });
        } else if (res.cancel) {
          // 用户点击了取消按钮
          console.log('Counter deletion canceled');
        }
      }
    });
  },

});