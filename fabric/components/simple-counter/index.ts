// components/simple-counter/index.ts

import { vibrate } from "../../utils/vibrate";

// 计数器存储键
const COUNTERS_STORAGE_KEY = "simpleCounters";

// 设置存储键
const SETTINGS_STORAGE_KEYS = {
  VIBRATION: "counter_vibration_state",
  VOICE: "counter_voice_state",
};

// 通用的提示配置
const TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

// 音效配置
const voiceConfig = {
  src: "/assets/audio_voice.m4a",
  enableOperate: ["increaseCount", "decreaseCount"],
};

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 计数器ID，用于持久化存储
    id: {
      type: String,
      value: "",
      observer(newVal: string) {
        if (newVal) {
          this.loadCounterValue();
        }
      },
    },
    // 是否默认为0（可选）
    defaultZero: {
      type: Boolean,
      value: true,
    },
    // 计数器背景颜色
    backgroundColor: {
      type: String,
      value: "#ffffff",
    },
    // 是否启用语音
    enableVoice: {
      type: Boolean,
      value: wx.getStorageSync(SETTINGS_STORAGE_KEYS.VOICE) || false,
    },
    // 是否启用震动
    enableVibration: {
      type: Boolean,
      value: wx.getStorageSync(SETTINGS_STORAGE_KEYS.VIBRATION) || false,
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    count: 0,
    options: {
      during: 1, // (number) 动画时间
      height: 40, // (number) 滚动行高 px
      cellWidth: 24, // (number) 单个数字宽度 px
      ease: "cubic-bezier(0, 1, 0, 1)", // (string) 动画过渡效果
      color: "#000000", // (string) 字体颜色
      columnStyle: "font-size: 64rpx;", // (string) 字体单元 覆盖样式
    },
  },

  /**
   * 组件的生命周期函数
   */
  lifetimes: {
    attached() {
      // 组件挂载时加载保存的值
      if (this.properties.id) {
        this.loadCounterValue();
      }

      // 加载设置
      this.loadSettings();
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 加载设置
     */
    loadSettings() {
      // 从本地存储加载设置
      this.setData({
        enableVoice: wx.getStorageSync(SETTINGS_STORAGE_KEYS.VOICE) || false,
        enableVibration:
          wx.getStorageSync(SETTINGS_STORAGE_KEYS.VIBRATION) || false,
      });
    },
    /**
     * 加载计数器值
     */
    loadCounterValue() {
      const counterId = this.properties.id;
      if (!counterId) return;

      try {
        // 从本地存储中获取计数器值
        const countersStorage = wx.getStorageSync(COUNTERS_STORAGE_KEY) || {};
        let counterValue = countersStorage[counterId];

        // 如果没有保存的值，且defaultZero为true，则使用0
        if (counterValue === undefined && this.properties.defaultZero) {
          counterValue = 0;
        }

        // 如果有值，更新数据
        if (counterValue !== undefined) {
          this.setData({
            count: counterValue,
          });
        }
      } catch (error) {
        console.error("Failed to load counter value:", error);
      }
    },

    /**
     * 保存计数器值
     */
    saveCounterValue() {
      const counterId = this.properties.id;
      if (!counterId) return;

      try {
        // 保存到本地存储
        const countersStorage = wx.getStorageSync(COUNTERS_STORAGE_KEY) || {};
        countersStorage[counterId] = this.data.count;
        wx.setStorageSync(COUNTERS_STORAGE_KEY, countersStorage);

        // 触发计数变化事件
        this.triggerEvent("change", {
          id: counterId,
          count: this.data.count,
        });
      } catch (error) {
        console.error("Failed to save counter value:", error);
      }
    },

    /**
     * 增加计数器值
     */
    increaseCount() {
      const newCount = this.data.count + 1;
      this.setData({
        count: newCount,
      });
      this.saveCounterValue();

      // 播放音效
      if (
        this.properties.enableVoice &&
        voiceConfig.enableOperate.includes("increaseCount")
      ) {
        const innerAudioContext = wx.createInnerAudioContext();
        innerAudioContext.src = voiceConfig.src;
        innerAudioContext.play();
      }

      // 震动反馈
      if (this.properties.enableVibration) {
        vibrate();
      }
    },

    /**
     * 减少计数器值
     */
    decreaseCount() {
      // 防止计数为负数
      if (this.data.count <= 0) {
        this.showToast("已经是最小值了");
        return;
      }

      const newCount = this.data.count - 1;
      this.setData({
        count: newCount,
      });
      this.saveCounterValue();

      // 播放音效
      if (
        this.properties.enableVoice &&
        voiceConfig.enableOperate.includes("decreaseCount")
      ) {
        const innerAudioContext = wx.createInnerAudioContext();
        innerAudioContext.src = voiceConfig.src;
        innerAudioContext.play();
      }

      // 震动反馈
      if (this.properties.enableVibration) {
        vibrate();
      }
    },

    /**
     * 重置计数器值
     */
    resetCount() {
      this.setData({
        count: 0,
      });
      this.saveCounterValue();
    },

    /**
     * 获取当前计数值（供父组件调用）
     */
    getCurrentCount() {
      return this.data.count;
    },

    /**
     * 设置当前计数值（供父组件调用）
     */
    setCount(count: number) {
      this.setData({
        count,
      });
      this.saveCounterValue();
    },
    
    /**
     * 显示Toast提示
     */
    showToast(title: string) {
      wx.showToast({
        title,
        ...TOAST_CONFIG,
      });
    },
  },
});
