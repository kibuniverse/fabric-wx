import { eventBus } from "../../utils/event_bus";
import { vibrate } from "../../utils/vibrate";
import { loadStorageData } from "../../utils/util";

// pages/counter/counter.ts
const STORAGE_KEYS = {
  VIBRATION: "counter_vibration_state",
  KEEP_SCREEN: "counter_keep_screen_state",
  VOICE: "counter_voice_state",
  COUNTER_KEYS: "counter_keys",
  ACTIVE_KEY: "counter_active_key",
};

const defaultCounterKeys = [
  { key: "default_counter", title: "默认计数器" },
  { key: "default_counter_1", title: "默认计数器1" },
];

/** 监听是否有备忘录的修改 */
let isMemoModified = false;

Page({
  // 用于记录浮球移动的坐标
  moveX: 0,
  moveY: 0,

  onShareAppMessage() {
    return {
      title: "织毛线怕忘行数？用知织！",
      path: "pages/counter/counter",
      imageUrl: "/assets/share.png",
    };
  },
  data: {
    isVibrationOn: false,
    isKeepScreenOn: false,
    isVoiceOn: false,
    // 增加计数器key列表
    counterKeys: [] as { key: string; title: string }[],
    activeKey: "",
    activeTab: 0,
    // 添加新计数器相关
    showAddCounter: false,
    newCounterName: "",
    addCounterButtons: [
      { text: "取消", className: "cancel-btn" },
      { text: "确定", className: "confirm-btn" },
    ],
    floatBall: {
      x: 0, // movable-view 坐标
      y: 0,
      winW: 0, // 屏幕宽高
      winH: 0,
      ballW: 50, // 球尺寸（px）
      ballH: 50,
      opacity: 0,
    },
    /** 悬浮计数器位置 */
    floatLevitateCount: {
      x: 0,
      y: 0,
    },
  },

  // 在Page对象内新增方法
  initStorageSettings() {
    const keys = loadStorageData(STORAGE_KEYS.COUNTER_KEYS, defaultCounterKeys);
    const activeKey = loadStorageData(STORAGE_KEYS.ACTIVE_KEY, "");

    this.setData({
      counterKeys: keys,
      activeKey,
      isVibrationOn: loadStorageData(STORAGE_KEYS.VIBRATION, false),
      isKeepScreenOn: loadStorageData(STORAGE_KEYS.KEEP_SCREEN, false),
      isVoiceOn: loadStorageData(STORAGE_KEYS.VOICE, false),
    });
  },

  initKeepScreen() {
    wx.setKeepScreenOn({
      keepScreenOn: this.data.isKeepScreenOn,
    });
  },

  initEventListeners() {
    eventBus.on("onMemoContentChange", () => {
      isMemoModified = true;
    });
  },

  initFloatPosition() {
    const sys = wx.getSystemInfoSync();
    const { windowWidth, windowHeight } = sys;
    const margin = 10;

    const query = wx.createSelectorQuery();
    query
      .select("#connect-ball")
      .boundingClientRect((rect) => {
        console.log("Float ball rect:", rect);
        const floatPos = wx.getStorageSync("floatPos") || {
          x: windowWidth - rect.width - margin,
          y: windowHeight * 0.75,
        };
        this.setData({
          "floatBall.winW": windowWidth,
          "floatBall.winH": windowHeight,
          "floatBall.x": floatPos.x, // 右下角定位
          "floatBall.y": floatPos.y,
          "floatBall.ballW": rect.width,
          "floatBall.ballH": rect.height,
        });
        setTimeout(() => {
          this.setData({
            "floatBall.opacity": 1,
          });
        }, 1000);
      })
      .exec();
  },

  // 优化后的onLoad
  onLoad() {
    this.initStorageSettings();
    this.initKeepScreen();
    this.initEventListeners();
    this.initFloatPosition();
  },

  onShow() {
    this.initKeepScreen();
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1,
      });
    }
    if (isMemoModified) {
      setTimeout(() => {
        wx.showToast({
          title: "备忘录已更新~",
          icon: "none",
        });
        isMemoModified = false;
      }, 300);
    }
  },
  onTabClick(e: { detail: { index: number } }) {
    const index = e.detail.index;
    this.setData({
      activeTab: index,
    });
  },

  onConnectChange(e: any) {
    if (e.detail.source === "touch") {
      // 实时记录
      this.moveX = e.detail.x;
      this.moveY = e.detail.y;
    }
  },

  onTouchend() {
    const { floatBall: float } = this.data;
    const centerX = (this.moveX ?? float.x) + float.ballW / 2;
    const margin = 10;
    const finalX =
      centerX > float.winW / 2 ? float.winW - float.ballW - margin : margin;
    // 只改 x，y 保持手指离开时的值
    this.setData({
      "floatBall.x": finalX,
      "floatBall.y": this.moveY ?? float.y,
    });
    wx.setStorageSync("floatPos", { x: finalX, y: this.moveY ?? float.y });
  },
  onLevitateCountTouchend() {
    const { floatLevitateCount } = this.data;
    console.log("levitate count touchend", floatLevitateCount);
  },
  /**
   * 点击连接按钮时触发的事件处理函数
   */
  onClickConnect() {
    console.log("onClick connect");
  },
  onChange(e: { detail: { index: number } }) {
    const index = e.detail.index;
    this.setData({
      activeTab: index,
    });
    wx.nextTick(() => {
      // 切换 tab 后，确保 counter 组件已渲染再暂停计时器
      const components = this.selectAllComponents("#counter");
      if (components && components.length) {
        components.forEach((comp) => {
          if (comp && comp.stopTimer) {
            comp.stopTimer();
          }
        });
      }
    });
  },
  showToast(message: string) {
    wx.showToast({
      title: message,
      icon: "none",
    });
  },

  toggleVibration() {
    const newState = !this.data.isVibrationOn;
    this.setData({ isVibrationOn: newState });
    wx.setStorageSync(STORAGE_KEYS.VIBRATION, newState);
    this.showToast(newState ? "震动反馈已开启~" : "震动反馈已关闭~");
    if (newState) {
      vibrate();
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
      keepScreenOn: newState,
    });
    this.showToast(newState ? "屏幕常亮已开启" : "屏幕常亮已关闭");
  },

  // 添加新计数器相关方法
  showAddCounterDialog() {
    this.setData({
      showAddCounter: true,
      newCounterName: "",
    });
  },

  onNewCounterNameInput(e: any) {
    this.setData({
      newCounterName: e.detail.value,
    });
  },

  handleAddCounterDialogButton(e: any) {
    const { index } = e.detail;
    if (index === 0) {
      // 取消按钮
      this.setData({
        showAddCounter: false,
      });
    } else if (index === 1) {
      // 确定按钮
      this.addNewCounter();
    }
  },

  addNewCounter() {
    const { newCounterName } = this.data;
    if (!newCounterName.trim()) {
      this.showToast("计数器名称不能为空");
      return;
    }

    // 生成唯一key
    const timestamp = new Date().getTime();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const newKey = `counter_${timestamp}_${randomStr}`;

    // 添加新计数器
    const newCounterKeys = [
      ...this.data.counterKeys,
      {
        key: newKey,
        title: newCounterName.trim(),
      },
    ];

    // 更新本地存储和数据
    wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);

    const DEFAULT_COUNTER_DATA = {
      name: newCounterName.trim(),
      targetCount: 999,
      currentCount: 0,
      startTime: 0,
      history: [],
      timerState: {
        startTimestamp: 0,
        elapsedTime: 0,
      },
    };
    wx.setStorageSync(newKey, DEFAULT_COUNTER_DATA);

    this.setData({
      counterKeys: newCounterKeys,
      showAddCounter: false,
      activeTab: newCounterKeys.length - 1, // 切换到新添加的计数器
    });

    this.showToast("计数器添加成功");
  },
  modifyName(e: any) {
    const key = e.currentTarget.dataset.id;
    const newName = e.detail.data.name.trim();
    const counter = this.data.counterKeys.find((item) => item.key === key);
    if (!counter) {
      this.showToast("计数器不存在");
      return;
    }
    const newCounterKeys = this.data.counterKeys.map((item) => {
      if (item.key === key) {
        return { ...item, title: newName };
      }
      return item;
    });
    this.setData({
      counterKeys: newCounterKeys,
    });
    wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);

    this.selectComponent("#tabs").resize();
  },

  handleCounterDelete(e: { detail: { id: string } }) {
    // 添加确认删除计数器的弹窗
    wx.showModal({
      title: "确认删除",
      content: "确定要删除这个计数器吗？",
      confirmText: "删除",
      confirmColor: "#FF0000",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          // 用户点击了确认按钮
          // 如果只剩余了一个计时器，则提示不能删除
          const counterKeys = this.data.counterKeys;
          const deletedCounter = counterKeys.find(
            (key) => key.key === e.detail.id
          );
          const deletedCounterTitle = deletedCounter?.title;

          // 删除 counterkeys中的key
          // 找到被删除的计数器在原数组中的索引
          const deletedIndex = this.data.counterKeys.findIndex(
            (key) => key.key === e.detail.id
          );
          const newCounterKeys = this.data.counterKeys.filter(
            (key) => key.key !== e.detail.id
          );
          wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);
          this.setData({ counterKeys: newCounterKeys });

          // 如果删除的是第一个计数器，则激活第二个计数器（新的第一个）
          // 否则激活被删除计数器的前一个
          let newActiveTab = deletedIndex === 0 ? 0 : deletedIndex - 1;
          // 确保索引有效
          newActiveTab = Math.min(newActiveTab, newCounterKeys.length - 1);
          this.setData({ activeTab: newActiveTab });
          this.showToast(`计数器 ${deletedCounterTitle} 已删除`);
          this.selectComponent("#tabs").resize();
        } else if (res.cancel) {
          // 用户点击了取消按钮
          console.log("Counter deletion canceled");
        }
      },
    });
  },
});
