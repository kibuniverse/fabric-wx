Component({
  data: {
    selected: 0,
    color: "#00000066",
    selectedColor: "#A889C8",
    list: [{
      pagePath: "pages/home/home",
      iconPath: "/assets/home.svg",
      selectedIconPath: "/assets/home_select.svg",
      text: "首页"
    }, {
      pagePath: "pages/library/library",
      iconPath: "/assets/library.svg",
      selectedIconPath: "/assets/library_select.svg",
      text: "资料库"
    }, {
      pagePath: "pages/counter/counter",
      iconPath: "/assets/counter.svg",
      selectedIconPath: "/assets/counter_select.svg",
      text: "计数器"
    }, {
      pagePath: "pages/settings/settings",
      iconPath: "/assets/settings.svg",
      selectedIconPath: "/assets/settings_select.svg",
      text: "设置"
    }]
  },
  attached() {
    // 获取当前页面路径，设置选中状态
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      const route = currentPage && currentPage.route || '';
      const index = this.data.list.findIndex(item => item.pagePath === route);
      if (index !== -1) {
        this.setData({ selected: index });
      } else {
        // 如果没有找到匹配的路由，默认选中计数器标签
        this.setData({ selected: 2 });
      }
    } else {
      // 如果页面栈为空，默认选中计数器标签
      this.setData({ selected: 2 });
    }
  },
  methods: {
    switchTab(e: any) {
      const data = e.currentTarget.dataset;
      const url = '/' + data.path;
      wx.switchTab({ url });
      this.setData({
        selected: data.index
      });
    }
  }
})