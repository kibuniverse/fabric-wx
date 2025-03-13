Component({
  properties: {
    message: {
      type: String,
      value: ''
    },
    duration: {
      type: Number,
      value: 2500 // 默认显示2.5秒
    }
  },

  data: {
    show: false,
    message: '',
    timer: 0 as number
  },

  methods: {
    showToast(message?: string) {
      // 清除现有的定时器
      if (this.data.timer) {
        clearTimeout(this.data.timer);
      }

      // 如果传入message，则更新message
      if (message) {
        this.setData({ message });
      }
      
      // 显示toast
      this.setData({ show: true });

      // 设置新的定时器
      const timer = setTimeout(() => {
        this.hideToast();
      }, this.data.duration) as unknown as number;

      // 保存定时器ID
      this.setData({ timer });
    },

    hideToast() {
      this.setData({ 
        show: false,
        timer: 0
      });
    }
  },

  // 组件销毁时清理定时器
  detached() {
    if (this.data.timer) {
      clearTimeout(this.data.timer);
    }
  }
})
