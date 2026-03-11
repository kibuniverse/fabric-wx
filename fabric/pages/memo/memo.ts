import { eventBus } from "../../utils/event_bus";

// 防抖定时器
let debounceTimer: number | null = null;

Page({
  data: {
    key: '',
    type: '', // 'counter' 或 'item'
    content: '',
    lastModified: ''
  },

  onLoad(options) {
    const key = options.key;
    const type = options.type || 'item'; // 默认为 item 类型（图解）
    // 从本地存储获取上次修改时间
    const lastModified = wx.getStorageSync(`memo_${key}_lastModified`);

    this.setData({
      key: key,
      type: type,
      content: decodeURIComponent(options.content || ""),
      lastModified: lastModified || ''
    });
  },

  onUnload() {
    // 页面卸载时确保最后一次修改时间已保存
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      const currentTime = new Date().toLocaleString();
      wx.setStorageSync(`memo_${this.data.key}_lastModified`, currentTime);
    }
    // 确保最后一次数据同步
    this.handleFillBackData();
  },

  handleInput(e: WechatMiniprogram.Input) {
    const content = e.detail.value;
    this.setData({
      content: content,
    });
    // 使用防抖保存修改时间
    this.debouncedSaveLastModified();
    this.handleFillBackData();
  },

  debouncedSaveLastModified() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      const currentTime = new Date().toLocaleString();
      wx.setStorageSync(`memo_${this.data.key}_lastModified`, currentTime);
      this.setData({
        lastModified: currentTime
      });
      debounceTimer = null;
    }, 500) as unknown as number;
  },

  handleFillBackData() {
    const data = {
      key: this.data.key,
      content: this.data.content
    };
    // 使用 try-catch 保护 EventChannel 调用
    try {
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && typeof eventChannel.emit === 'function') {
        eventChannel.emit('onMemoContentChange', data);
      }
    } catch (e) {
      console.warn('EventChannel not available:', e);
    }
    // 通知计数器页面备忘录已更新
    if (this.data.type === 'counter') {
      eventBus.emit('onMemoContentChange', void 0);
    }
  },

  handleClear() {
    if (this.data.content === '') {
      wx.showToast({
        title: '内容已为空',
        icon: 'none'
      });
      return
    }
    wx.showModal({
      title: '提示',
      content: '确定要清空内容吗？',
      success: (res) => {
        if (res.confirm) {
          const currentTime = new Date().toLocaleString();
          wx.setStorageSync(`memo_${this.data.key}_lastModified`, currentTime);

          const content = '';
          this.setData({
            content,
            lastModified: currentTime
          });
          this.handleFillBackData()
        }
      }
    });
  }
});
