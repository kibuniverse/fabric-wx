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
    // 弹窗相关
    showTargetInput: false,
    showModifyCounterName: false,
    showModifyCount: false,
    targetInputValue: "",
    currentEditingKey: "",
    // 操作是否来源于子计数器
    isFromChildCounter: false,
    // 添加新计数器相关
    showAddCounter: false,
    // 重复计数器在哪一个主计数器下创建
    childCounterParentTab: 0,
    // 重复计数器-起始值输入弹窗
    showRepeatStartInputDialog: false,
    // 重复计数器-起始值
    repeatCounterStartValue: "",
    // 重复计数器-当前值
    repeatCounterCurValue: 0,
    // 重复计数器显示控制
    showRepeatCounter: false,
    // 重复次数
    repeatTimes: 1,
    options: {
      during: 1, // (number) 动画时间
      height: 40, // (number) 滚动行高 px
      cellWidth: 18, // (number) 单个数字宽度 px
      ease: "cubic-bezier(0, 1, 0, 1)", // (string) 动画过渡效果
      color: "#000000", // (string) 字体颜色
      columnStyle: "font-size: 54rpx;", // (string) 字体单元 覆盖样式
    },
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

  // 点击悬浮球时 打开重复计数器-弹窗
  showRepeatCounterDialog() {
    this.setData({
      showRepeatStartInputDialog: true,
      childCounterParentTab: this.data.activeTab,
    });
  },

  onBindRepeatStartInput(e: any) {
    let v = e.detail.value; // 字符串
    if (v === "") return; // 允许空，保留 placeholder

    v = Number(v); // 转数字
    if (isNaN(v)) v = 0; // 输字母时兜底
    if (v > 999) v = 999; // 上限截断
    if (v < 0) v = 0; // 顺便把负数也禁掉
    this.setData({
      repeatCounterCurValue: v,
      repeatCounterStartValue: v,
    });
  },

  onConfirmRepeatStartInputDialog() {
    this.setData({
      showRepeatStartInputDialog: false,
      showRepeatCounter: true,
    });
  },
  onCloseRepeatCounter() {
    this.setData({
      showRepeatCounter: false,
      repeatCounterStartValue: "",
      repeatCounterCurValue: 0,
      repeatTimes: 1,
    });
  },

  // 获取对应index的计数器实例
  getCounterByIndex(index: number): any {
    const counters = this.selectAllComponents("#counter");
    if (counters && counters.length > index) {
      return counters[index];
    }
    return null;
  },

  // 重复计数器 加 操作
  increaseRepeatNumber() {
    this.backToMainCounter();
    const mainCounter = this.getCounterByIndex(this.data.childCounterParentTab);
    // 主计数器当前值
    const mainCounterValue =
      mainCounter && mainCounter.getCurrentCount
        ? mainCounter.getCurrentCount()
        : 0;
    // 重复计数器当前值
    const repeatCounterValue = Number(this.data.repeatCounterCurValue);
    // 主计数器/重复计数器值不合法时，禁止加
    if (repeatCounterValue >= 999 || mainCounterValue >= 999) {
      this.showToast("已经是最大值了~");
      return;
    }
    if (mainCounter && mainCounter.increase) {
      this.setData({
        repeatCounterCurValue: this.data.repeatCounterCurValue + 1,
        isFromChildCounter: true,
      });
      mainCounter.increase(true);
    }
  },

  // 重复计数器 减 操作
  decreaseRepeatNumber() {
    this.backToMainCounter();
    // 子计数器所依附的主计数器
    const mainCounter = this.getCounterByIndex(this.data.childCounterParentTab);
    // 主计数器当前值
    const mainCounterValue =
      mainCounter && mainCounter.getCurrentCount
        ? mainCounter.getCurrentCount()
        : 0;
    // 重复计数器当前值
    const repeatCounterValue = Number(this.data.repeatCounterCurValue);
    // 主计数器/重复计数器值不合法时，禁止减
    if (repeatCounterValue <= 0 || mainCounterValue <= 0) {
      this.showToast("已经是最小值了~");
      return;
    }
    if (mainCounter && mainCounter.decrease) {
      this.setData({
        repeatCounterCurValue: this.data.repeatCounterCurValue - 1,
        isFromChildCounter: true,
      });
      mainCounter.decrease(true);
    }
  },

  // 跳转到创建当前子计数器的tab下
  backToMainCounter() {
    if (this.data.childCounterParentTab !== this.data.activeTab) {
      this.setData({
        activeTab: this.data.childCounterParentTab,
      });
    }
  },

  // 点击 重复计数器的 “重复”
  onRepat() {
    this.setData({
      repeatCounterCurValue: Number(this.data.repeatCounterStartValue),
      repeatTimes: this.data.repeatTimes + 1,
    });
    this.showToast("子计数器已恢复到初始值～");
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
          // 如果删除的计数器是子计数器绑定的计数器，则关闭子计数器
          if (
            this.data.showRepeatCounter &&
            this.data.childCounterParentTab === deletedIndex
          ) {
            this.onCloseRepeatCounter();
          }
        } else if (res.cancel) {
          // 用户点击了取消按钮
          console.log("Counter deletion canceled");
        }
      },
    });
  },

  // 处理设置目标行数
  handleShowTargetInput(e: any) {
    const { key, currentTarget } = e.detail;
    this.setData({
      showTargetInput: true,
      targetInputValue: String(currentTarget),
      currentEditingKey: key
    });
  },

  // 处理修改计数器名称
  handleShowModifyName(e: any) {
    const { key, currentName } = e.detail;
    this.setData({
      showModifyCounterName: true,
      targetInputValue: currentName,
      currentEditingKey: key
    });
  },

  // 处理修改当前行数
  handleShowModifyCount(e: any) {
    const { key, currentCount } = e.detail;
    this.setData({
      showModifyCount: true,
      targetInputValue: String(currentCount),
      currentEditingKey: key
    });
  },

  // 目标输入相关方法
  onTargetInput(e: any) {
    this.setData({
      targetInputValue: e.detail.value
    });
  },

  closeModifyTargetModal() {
    this.setData({
      showTargetInput: false
    });
  },

  closeModifyCounterNameModal() {
    this.setData({
      showModifyCounterName: false
    });
  },

  closeModifyCountModal() {
    this.setData({
      showModifyCount: false
    });
  },

  // 确认修改目标行数
  confirmTargetInput() {
    const newTarget = parseInt(this.data.targetInputValue);
    if (isNaN(newTarget) || newTarget <= 0 || newTarget > 999) {
      this.showToast("请输入1-999之间的数字");
      return;
    }

    const counterData = wx.getStorageSync(this.data.currentEditingKey);
    if (counterData) {
      counterData.targetCount = newTarget;
      wx.setStorageSync(this.data.currentEditingKey, counterData);
    }
    eventBus.emit('refreshCounter', { counterKey: this.data.currentEditingKey });
    this.setData({
      showTargetInput: false
    });
  },

  // 确认修改计数器名称
  confirmModifyCounterName() {
    const newName = this.data.targetInputValue.trim();
    if (!newName) {
      this.showToast("名称不能为空");
      return;
    }

    const counterData = wx.getStorageSync(this.data.currentEditingKey);
    if (counterData) {
      counterData.name = newName;
      wx.setStorageSync(this.data.currentEditingKey, counterData);
    }
    eventBus.emit('refreshCounter', { counterKey: this.data.currentEditingKey });
    this.setData({
      showModifyCounterName: false
    });
  },

  // 确认修改当前行数
  confirmModifyCountData() {
    const newCount = parseInt(this.data.targetInputValue);
    if (isNaN(newCount) || newCount < 0 || newCount > 999) {
      this.showToast("请输入0-999之间的数字");
      return;
    }
    const counterData = wx.getStorageSync(this.data.currentEditingKey);
    if (counterData) {
      counterData.currentCount = newCount;
      wx.setStorageSync(this.data.currentEditingKey, counterData);
    }
    eventBus.emit('refreshCounter', { counterKey: this.data.currentEditingKey });

    this.setData({
      showModifyCount: false
    });
  },



});
