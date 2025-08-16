Page({
  data: {
    key: '',
    content: '',
    lastModified: ''
  },

  onLoad(options) {
    console.log('Received options:', options);
    const key = options.key;
    // 从本地存储获取上次修改时间
    const lastModified = wx.getStorageSync(`memo_${key}_lastModified`);

    this.setData({
      key: key,
      content: decodeURIComponent(options.content || ""),
      lastModified: lastModified || ''
    });
  },

  handleInput(e: WechatMiniprogram.Input) {
    const currentTime = new Date().toLocaleString();
    // 保存修改时间到本地存储
    wx.setStorageSync(`memo_${this.data.key}_lastModified`, currentTime);

    this.setData({
      content: e.detail.value,
      lastModified: currentTime
    });
  },

  handleConfirm() {
    const eventChannel = this.getOpenerEventChannel()
    const data = {
      key: this.data.key,
      content: this.data.content
    }
    eventChannel.emit('onMemoContentChange', data)
    wx.navigateBack();
  },

  handleCancel() {
    wx.navigateBack();
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

          this.setData({
            content: '',
            lastModified: currentTime
          });
        }
      }
    });
  }
});
