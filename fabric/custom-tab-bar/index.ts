Component({
  data: {
    selected: 0,
    color: "#00000066",
    selectedColor: "#A889C8",
    list: [
      {
        pagePath: "pages/home/home",
        iconPath: "/assets/home.svg",
        selectedIconPath: "/assets/home_select.svg",
        text: "首页",
      },
      {
        pagePath: "pages/library/library",
        iconPath: "/assets/library.svg",
        selectedIconPath: "/assets/library_select.svg",
        text: "资料库",
      },
      {
        pagePath: "pages/counter/counter",
        iconPath: "/assets/counter.svg",
        selectedIconPath: "/assets/counter_select.svg",
        text: "计数器",
      },
      {
        pagePath: "pages/settings/settings",
        iconPath: "/assets/settings.svg",
        selectedIconPath: "/assets/settings_select.svg",
        text: "设置",
      },
    ],
  },
  attached() {},
  methods: {
    switchTab(e: any) {
      const data = e.currentTarget.dataset;
      const url = "/" + data.path;
      wx.switchTab({ url });
      this.setData({
        selected: data.index,
      });
    },
  },
});
