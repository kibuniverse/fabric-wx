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
      title: "毛线时光，有我陪伴",
      path: "/pages/counter/counter",
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
      cellWidth: 20, // (number) 单个数字宽度 px
      ease: "cubic-bezier(0, 1, 0, 1)", // (string) 动画过渡效果
      color: "#000000", // (string) 字体颜色
      columnStyle: "font-size:32px;", // (string) 字体单元 覆盖样式
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
    // 重置按钮引导气泡
    showResetGuide: false,
    // 计时器功能引导气泡
    showTimerGuide: false,
    // 恢复计时弹窗
    showResumeTimerDialog: false,
    resumeTimerKey: "",
    // 空闲暂停弹窗
    showIdleDialog: false,
    idleTimerKey: "",
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
    const { windowWidth, windowHeight, safeArea } = sys;
    const margin = 10;

    // 计算 tab 栏高度 (96rpx 转 px + 安全区域底部)
    const tabBarHeight = 96 / 750 * windowWidth + (sys.screenHeight - safeArea.bottom);

    const query = wx.createSelectorQuery();
    query
      .select("#connect-ball")
      .boundingClientRect((rect) => {
        const savedPos = wx.getStorageSync("floatPos");
        const maxY = windowHeight - rect.height - tabBarHeight - margin;
        const defaultX = windowWidth - rect.width - margin;
        const defaultY = windowHeight * 0.75;

        // 如果有保存的位置，确保 y 不超过安全区域
        let finalX = savedPos?.x ?? defaultX;
        let finalY = savedPos?.y ?? defaultY;
        finalY = Math.min(finalY, maxY);

        this.setData({
          "floatBall.winW": windowWidth,
          "floatBall.winH": windowHeight,
          "floatBall.x": finalX,
          "floatBall.y": finalY,
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
    this.initGuideBubbles();
  },

  initGuideBubbles() {
    const TIMER_GUIDE_KEY = 'counter_timer_guide_shown';
    const RESET_GUIDE_KEY = 'counter_reset_guide_shown';

    const timerGuideShown = wx.getStorageSync(TIMER_GUIDE_KEY);
    const resetGuideShown = wx.getStorageSync(RESET_GUIDE_KEY);

    // 计时器气泡优先显示
    if (!timerGuideShown) {
      this.setData({ showTimerGuide: true });
    } else if (!resetGuideShown) {
      // 计时器气泡已显示过，再显示重置气泡
      this.setData({ showResetGuide: true });
    }
  },

  onHideResetGuide() {
    this.setData({ showResetGuide: false });
    const GUIDE_SHOWN_KEY = 'counter_reset_guide_shown';
    wx.setStorageSync(GUIDE_SHOWN_KEY, true);
  },

  onHideTimerGuide() {
    this.setData({ showTimerGuide: false });
    const GUIDE_SHOWN_KEY = 'counter_timer_guide_shown';
    wx.setStorageSync(GUIDE_SHOWN_KEY, true);

    // 计时器气泡关闭后，检查是否需要显示重置气泡
    const RESET_GUIDE_KEY = 'counter_reset_guide_shown';
    const resetGuideShown = wx.getStorageSync(RESET_GUIDE_KEY);
    if (!resetGuideShown) {
      // 延迟显示，让用户有时间看到气泡消失
      setTimeout(() => {
        this.setData({ showResetGuide: true });
      }, 300);
    }
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
    // 检查当前 Tab 是否需要显示恢复计时弹窗
    this.checkResumeTimerDialog();
  },

  // 检查当前 Tab 是否需要显示恢复计时弹窗
  checkResumeTimerDialog() {
    wx.nextTick(() => {
      const counter = this.getCounterByIndex(this.data.activeTab);
      if (counter && counter.checkAndShowResumeDialog) {
        counter.checkAndShowResumeDialog();
      }
    });
  },

  // 处理组件触发的显示恢复弹窗事件
  handleShowResumeDialog(e: any) {
    const { key } = e.detail;
    this.setData({
      showResumeTimerDialog: true,
      resumeTimerKey: key,
    });
  },

  // 确认恢复计时
  onConfirmResumeTimer() {
    const counter = this.getCounterByIndex(this.data.activeTab);
    if (counter && counter.resumeTimer) {
      counter.resumeTimer();
    }
    this.setData({
      showResumeTimerDialog: false,
      resumeTimerKey: "",
    });
  },

  // 取消恢复计时
  onCancelResumeTimer() {
    const counter = this.getCounterByIndex(this.data.activeTab);
    if (counter && counter.cancelResumeTimer) {
      counter.cancelResumeTimer();
    }
    this.setData({
      showResumeTimerDialog: false,
      resumeTimerKey: "",
    });
  },

  // 处理空闲暂停弹窗事件
  handleShowIdleDialog(e: any) {
    const { key } = e.detail;
    this.setData({
      showIdleDialog: true,
      idleTimerKey: key,
    });
  },

  // 空闲暂停后恢复计时
  onConfirmIdleResume() {
    const counter = this.getCounterByIndex(this.data.activeTab);
    if (counter && counter.resumeFromIdle) {
      counter.resumeFromIdle();
    }
    this.setData({
      showIdleDialog: false,
      idleTimerKey: "",
    });
  },

  // 空闲暂停后保持暂停
  onCancelIdleResume() {
    const counter = this.getCounterByIndex(this.data.activeTab);
    if (counter && counter.cancelIdleResume) {
      counter.cancelIdleResume();
    }
    this.setData({
      showIdleDialog: false,
      idleTimerKey: "",
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
    const sys = wx.getSystemInfoSync();
    // 计算 tab 栏高度 (96rpx 转 px + 安全区域底部)
    const tabBarHeight = 96 / 750 * float.winW + (sys.screenHeight - sys.safeArea.bottom);
    const margin = 10;
    const maxY = float.winH - float.ballH - tabBarHeight - margin;

    const centerX = (this.moveX ?? float.x) + float.ballW / 2;
    const finalX =
      centerX > float.winW / 2 ? float.winW - float.ballW - margin : margin;
    // y 也要限制在安全区域内
    const rawY = this.moveY ?? float.y;
    const finalY = Math.max(margin, Math.min(rawY, maxY));

    this.setData({
      "floatBall.x": finalX,
      "floatBall.y": finalY,
    });
    wx.setStorageSync("floatPos", { x: finalX, y: finalY });
  },
  onChange(e: { detail: { index: number } }) {
    const index = e.detail.index;
    const previousIndex = this.data.activeTab;

    // 先暂停当前 Tab 的计时器
    const currentCounter = this.getCounterByIndex(previousIndex);
    if (currentCounter && currentCounter.pauseTimerAndMark) {
      currentCounter.pauseTimerAndMark();
    }

    this.setData({
      activeTab: index,
    });

    wx.nextTick(() => {
      // 检查新 Tab 是否需要显示恢复弹窗
      const newCounter = this.getCounterByIndex(index);
      if (newCounter && newCounter.checkAndShowResumeDialog) {
        newCounter.checkAndShowResumeDialog();
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
          const counterId = e.detail.id;
          // 用户点击了确认按钮
          // 如果只剩余了一个计时器，则提示不能删除
          const counterKeys = this.data.counterKeys;
          const deletedCounter = counterKeys.find(
            (key) => key.key === counterId
          );
          const deletedCounterTitle = deletedCounter?.title;

          // 删除 counterkeys中的key
          // 找到被删除的计数器在原数组中的索引
          const deletedIndex = this.data.counterKeys.findIndex(
            (key) => key.key === counterId
          );
          const newCounterKeys = this.data.counterKeys.filter(
            (key) => key.key !== counterId
          );
          wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);
          this.setData({ counterKeys: newCounterKeys });

          // 清理计数器相关数据
          wx.removeStorageSync(counterId); // 计数器数据
          wx.removeStorageSync(`memo_${counterId}_lastModified`); // 备忘录修改时间

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

    // 修改计数器名称
    const newCounterKeys = this.data.counterKeys.map((item) => {
      if (item.key === this.data.currentEditingKey) {
        return { ...item, title: newName };
      }
      return item;
    });
    this.setData({
      counterKeys: newCounterKeys,
    });
    wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);
    const counterData = wx.getStorageSync(this.data.currentEditingKey);
    if (counterData) {
      counterData.name = newName;
      wx.setStorageSync(this.data.currentEditingKey, counterData);
    }
    eventBus.emit('refreshCounter', { counterKey: this.data.currentEditingKey });
    this.setData({
      showModifyCounterName: false
    });
    this.selectComponent("#tabs").resize();
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
