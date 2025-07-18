Component({
  data: {
    selected: null,
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
        pagePath: "pages/counter/counter",
        iconPath: "/assets/counter.svg",
        selectedIconPath: "/assets/counter_select.svg",
        text: "计数器",
      },
    ],
  },
  attached() { },
  methods: {
    switchTab(e: any) {
      const data = e.currentTarget.dataset;
      const url = "/" + data.path;
      wx.switchTab({ url });
    },
  },
});
