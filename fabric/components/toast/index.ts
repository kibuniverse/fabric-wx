Component({
  properties: {
    message: {
      type: String,
      value: ''
    },
    icon: {
      type: String,
      value: 'none' // 'success' | 'error' | 'none'
    },
    duration: {
      type: Number,
      value: 2500
    }
  },

  data: {
    show: false,
    message: '',
    icon: 'none',
    timer: 0 as number,
    animating: false
  },

  methods: {
    showToast(message?: string, icon?: string) {
      if (this.data.timer) {
        clearTimeout(this.data.timer);
      }

      const updates: Record<string, string | boolean> = { show: true, animating: true };
      if (message) {
        updates.message = message;
      }
      if (icon) {
        updates.icon = icon;
      }
      this.setData(updates);

      // 触发进入动画
      setTimeout(() => {
        this.setData({ animating: false });
      }, 50);

      const timer = setTimeout(() => {
        this.hideToast();
      }, this.data.duration) as unknown as number;

      this.setData({ timer });
    },

    hideToast() {
      this.setData({
        show: false,
        animating: true,
        timer: 0
      });
    }
  },

  detached() {
    if (this.data.timer) {
      clearTimeout(this.data.timer);
    }
  }
})
