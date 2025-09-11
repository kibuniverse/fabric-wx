import Dialog from "@vant/weapp/dialog/dialog";
import { vibrate } from "../../utils/vibrate";

interface CounterData {
  name: string;
  targetCount: number;
  currentCount: number;
  startTime: number;
  history: Array<{
    time: string;
    action: string;
    count: number;
    isNew?: boolean;
    id: number;
  }>;
  timerState: {
    startTimestamp: number;
    elapsedTime: number;
  };
  showDeleteBtn: boolean;
  memo: string; // 添加备忘录字段
}

const DEFAULT_COUNTER_DATA: CounterData = {
  name: "默认计数器",
  targetCount: 999,
  currentCount: 0,
  startTime: 0,
  history: [],
  timerState: {
    startTimestamp: 0,
    elapsedTime: 0,
  },
  showDeleteBtn: true,
  memo: "", // 默认备忘录为空
};

// 通用的提示配置
const TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

const voiceConfig = {
  src: "/assets/audio_voice.m4a",
  enableOperate: ["increase", "decrease"],
};

// 在 methods 外部直接暴露 stopTimer，保证父组件可直接调用
function stopTimerProxy(this: any) {
  if (this && this.stopTimer) {
    this.stopTimer();
  } else if (this && this.methods && this.methods.stopTimer) {
    this.methods.stopTimer.call(this);
  }
}

Component({
  properties: {
    onClickDelete: {
      type: Object,
      value: () => { }, // 默认值为 null
    },
    vibrationOn: {
      type: Boolean,
      value: false,
    },
    voiceOn: {
      type: Boolean,
      value: false,
    },
    storageKey: {
      type: String,
      value: "default_counter",
    },
    showDeleteBtn: {
      type: Boolean,
      value: true,
    },
  },
  pageLifetimes: {
    hide() {
      // 在这里可以执行一些逻辑，例如保存数据或暂停操作
      this.stopTimer();
    },
  },
  data: {
    counterData: DEFAULT_COUNTER_DATA,
    timerDisplay: "00:00:00",
    isTimerRunning: false,
    timerInterval: 0,
    showTargetInput: false,
    targetInputValue: "",
    options: {
      during: 1, // (number) 动画时间
      height: 40, // (number) 滚动行高 px
      cellWidth: 30, // (number) 单个数字宽度 px
      ease: "cubic-bezier(0, 1, 0, 1)", // (string) 动画过渡效果
      color: "#000000", // (string) 字体颜色
      columnStyle: "font-size: 48px;", // (string) 字体单元 覆盖样式
    },
    modifyCounterButton: [
      { text: "取消", className: "cancel-btn" },
      { text: "确定", className: "confirm-btn" },
    ],
    historyScrollTop: 0, // 新增 scrollTop 绑定
    showModifyCounterName: false, // 控制修改计数器名称的弹窗显示
    showModifyCount: false, // 控制修改当前行数的弹窗显示
    hasMemo: false,
  },

  lifetimes: {
    attached() {
      this.setData({
        showDeleteBtn: this.properties.showDeleteBtn,
      });
      this.loadCounterData();
      this.restoreTimerState();
    },
    detached() {
      this.stopTimer();
    },
  },

  methods: {
    // 数据持久化相关
    loadCounterData() {
      try {
        const savedData = wx.getStorageSync(this.properties.storageKey);
        if (savedData) {
          const counterData = {
            ...DEFAULT_COUNTER_DATA,
            ...savedData,
            timerState: {
              ...DEFAULT_COUNTER_DATA.timerState,
              ...(savedData.timerState || {}),
            },
          };
          this.setData({
            counterData,
            hasMemo: !!savedData.memo, // 检查是否有备忘录
          });
        }
      } catch (error) {
        console.error("Failed to load counter data:", error);
      }
    },
    handleMemoClick() {
      const memoKey = `memo_${this.properties.storageKey}`;
      wx.navigateTo({
        url: `/pages/memo/memo?key=${memoKey}&content=${encodeURIComponent(this.data.counterData.memo || '')}`,
        events: {
          onMemoContentChange: (data: { key: string, content: string }) => {
            if (data.key === memoKey && typeof data.content === 'string') {
              this.updateMemo(data.content);
            }
          }
        }
      });
    },

    // 添加更新备忘录的方法
    updateMemo(content: string) {
      this.setData({
        'counterData.memo': content,
        hasMemo: !!content
      });
      this.saveCounterData();
    },

    saveCounterData() {
      wx.setStorageSync(this.properties.storageKey, this.data.counterData);
    },
    playVoice() {
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.autoplay = true;
      innerAudioContext.src = "/assets/audio_voice.m4a";
      innerAudioContext.onPlay(() => {
        console.log("开始播放");
      });
      innerAudioContext.onError((res) => {
        console.log(res.errMsg);
        console.log(res.errCode);
      });
    },
    // 计数器操作相关
    async handleCountChange(type: "increase" | "decrease" | "reset") {
      const { currentCount, targetCount } = this.data.counterData;
      const canShowVoice =
        this.properties.voiceOn && voiceConfig.enableOperate.includes(type);
      if (canShowVoice) {
        this.playVoice();
      }

      const canShowVibration = this.properties.vibrationOn;
      if (canShowVibration) {
        vibrate();
      }

      if (type === "reset") {
        if (this.data.counterData.currentCount === 0) {
          this.showToast("当前行数为0，无需重置");
          return;
        }
        this.showModal({
          title: "确认重置",
          content: "确定要重置计数器吗？",
          success: async (
            res: WechatMiniprogram.ShowModalSuccessCallbackResult
          ) => {
            if (res.confirm) {
              await this.updateCount(0, "重置计数");
            }
          },
        });
        return;
      }

      const isIncrease = type === "increase";

      if (!isIncrease && currentCount <= 0) {
        this.showToast("已经是最小值了~");
        return;
      }
      if (isIncrease && currentCount >= 999) {
        this.showToast("已经是最大值了~");
        return;
      }

      const newCount = currentCount + (isIncrease ? 1 : -1);
      this.updateCount(newCount, isIncrease ? "行+1" : "行-1");

      if (isIncrease && newCount === targetCount) {
        Dialog.confirm({
          context: this,
          title: "🎉\u00A0\u00A0\u00A0已达到目标行数",
          message: "已经完成了上次设置的目标～",
          cancelButtonText: "重置当前行",
          confirmButtonText: "继续织",
        }).catch(() => {
          this.updateCount(0, "重置计数");
        });
      }
    },
    handleClickModifyCount() {
      this.setData({
        showModifyCount: true,
        targetInputValue: String(this.data.counterData.currentCount),
      });
    },
    closeModifyCountModal() {
      this.setData({
        showModifyCount: false,
        targetInputValue: String(this.data.counterData.currentCount),
      });
    },
    confirmModifyCountData() {
      const newCount = parseInt(this.data.targetInputValue);
      if (isNaN(newCount)) {
        wx.showToast({
          title: "请输入有效数字",
          icon: "none",
        });
        return;
      }
      if (newCount < 0) {
        wx.showToast({
          title: "行数不能小于0",
          icon: "none",
        });
        return;
      }
      this.updateCount(newCount, `修改行数为${newCount}`);
    },

    handleClickModifyCounterName() {
      this.setData({
        showModifyCounterName: true,
        targetInputValue: this.data.counterData.name,
      });
    },
    closeModifyCounterNameModal() {
      this.setData({
        showModifyCounterName: false,
        targetInputValue: this.data.counterData.name,
      });
    },
    confirmModifyCounterName() {
      const newName = this.data.targetInputValue.trim();
      if (newName === "") {
        wx.showToast({
          title: "计数器名称不能为空",
          icon: "none",
        });
        return;
      }
      this.setData({
        "counterData.name": newName,
        showModifyCounterName: false,
        targetInputValue: newName
      });
      this.saveCounterData();
      this.triggerEvent('modifyName', { data: { name: newName } }, {
        bubbles: true,     // 是否冒泡
        composed: true     // 是否跨组件边界
      });
    },

    async updateCount(newCount: number, action: string) {
      this.setData({
        "counterData.currentCount": newCount,
      });

      // 保存数据并添加历史记录
      this.saveCounterData();
      this.addHistory(action);
    },
    showToast(title: string) {
      wx.showToast({
        title,
        ...TOAST_CONFIG,
      });
    },

    showModal(options: {
      title: string;
      content: string;
      success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => void;
    }) {
      wx.showModal(options);
    },

    // 历史记录相关
    addHistory(action: string) {
      const now = new Date();
      const timeString = this.formatDateTime(now);

      // 先将所有现有记录的 isNew 标记移除
      const currentHistory = this.data.counterData.history.map((item) => ({
        ...item,
        isNew: false,
      }));

      // 创建新的历史记录项
      const newHistoryItem = {
        time: timeString,
        action,
        count: this.data.counterData.currentCount,
        isNew: true,
        id: Date.now(), // 添加唯一标识符
      };

      // 更新历史记录列表，只保留最近20条
      const newHistory = [newHistoryItem, ...currentHistory].slice(0, 20);

      // 设置新的历史记录
      this.setData({
        "counterData.history": newHistory,
        historyScrollTop: 0, // 新增 scrollTop 绑定
      });

      // 延迟移除动画类
      setTimeout(() => {
        if (this.data.counterData.history.length > 0) {
          const updatedHistory = this.data.counterData.history.map((item) => ({
            ...item,
            isNew: false,
          }));

          this.setData({
            "counterData.history": updatedHistory,
          });
        }
      }, 300);

      this.saveCounterData();
    },

    clearHistory() {
      // 清空历史记录
      this.setData({
        "counterData.history": [],
      });

      // 保存数据
      this.saveCounterData();

      // 显示清除成功提示
      this.showToast("记录已清除");
    },
    toggleTimer() {
      if (this.data.isTimerRunning) {
        wx.showToast({
          title: "暂停计时",
          icon: "none",
        });
        this.stopTimer();
      } else {
        wx.showToast({
          title: "开启计时",
          icon: "none",
        });
        this.startTimer();
      }
    },

    // 计时器相关
    startTimer() {
      // 1. 读取已累计的 elapsedTime
      let initialElapsed = this.data.counterData.timerState.elapsedTime || 0;
      // 2. 记录当前开始时间
      const startTime = Date.now();
      // 3. 清理旧的定时器
      this.clearTimer();
      // 4. 启动新定时器
      const timerInterval = setInterval(() => {
        const elapsed = initialElapsed + (Date.now() - startTime);
        this.setData({
          timerDisplay: this.formatTime(elapsed),
        });
      }, 1000);
      // 5. 更新状态
      const counterData = this.data.counterData;
      counterData.timerState.startTimestamp = startTime;
      this.setData({
        timerInterval,
        isTimerRunning: true,
        counterData,
      });
      // 6. 立即存储当前状态
      this.saveCounterData();
    },

    stopTimer() {
      // 1. 清理定时器
      this.clearTimer();
      // 2. 计算累计用时
      const counterData = this.data.counterData;
      const elapsed = this.getCurrentElapsedTime();
      counterData.timerState.elapsedTime = elapsed;
      counterData.timerState.startTimestamp = 0;
      // 3. 更新状态
      this.setData({
        counterData,
        isTimerRunning: false,
      });
      // 4. 存储当前状态
      this.saveCounterData();
    },

    clearTimer() {
      if (this.data.timerInterval) {
        clearInterval(this.data.timerInterval);
        this.setData({ timerInterval: 0 });
      }
    },

    getCurrentElapsedTime(): number {
      const { startTimestamp, elapsedTime } = this.data.counterData.timerState;
      if (!this.data.isTimerRunning || !startTimestamp) return elapsedTime || 0;
      return (elapsedTime || 0) + (Date.now() - startTimestamp);
    },

    // 组件挂载时自动恢复计时器状态
    restoreTimerState() {
      const { counterData } = this.data;
      if (counterData) {
        const totalElapsed = counterData.timerState.elapsedTime || 0;
        this.setData({
          timerDisplay: this.formatTime(totalElapsed),
          isTimerRunning: false,
        });
      }
    },

    // 格式化相关
    formatTime(milliseconds: number): string {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      return this.padNumbers(hours, minutes, seconds);
    },

    formatDateTime(date: Date): string {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
      )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },

    padNumbers(...numbers: number[]): string {
      return numbers.map((n) => n.toString().padStart(2, "0")).join(":");
    },

    // 目标设置相关
    showTargetInput() {
      this.setData({
        showTargetInput: true,
        targetInputValue: String(this.data.counterData.targetCount),
      });
    },
    closeModifyTargetModal() {
      this.cancelTargetInput()
    },
    onTargetInput(e: any) {
      this.setData({
        targetInputValue: e.detail.value,
      });
    },
    cancelTargetInput() {
      this.setData({
        showTargetInput: false,
        targetInputValue: "",
      });
    },

    confirmTargetInput() {
      const value = parseInt(this.data.targetInputValue);
      if (isNaN(value)) {
        wx.showToast({
          title: "请输入有效数字",
          icon: "none",
        });
        return;
      }

      if (value < 0) {
        wx.showToast({
          title: "目标行数不能小于0",
          icon: "none",
        });
        return;
      }

      if (value > 999) {
        wx.showToast({
          title: "目标行数不能超过999",
          icon: "none",
        });
        return;
      }

      this.setData({
        "counterData.targetCount": value,
        showTargetInput: false,
        targetInputValue: "",
      });
      this.saveCounterData();
    },

    // 删除相关
    handleCounterDelete() {
      var myEventDetail = {
        id: this.properties.storageKey,
      }; // detail对象，提供给事件监听函数
      var myEventOption = {}; // 触发事件的选项
      this.triggerEvent("handleCounterDelete", myEventDetail, myEventOption);
    },

    // 公共方法
    increase() {
      this.handleCountChange("increase");
    },

    decrease() {
      this.handleCountChange("decrease");
    },
    showResetConfirm() {
      this.handleCountChange("reset");
    },
  },
});
// 兼容 selectComponent/AllComponents 调用
// @ts-ignore
Component.prototype.stopTimer = stopTimerProxy;

/**
 * 该文件为计数器组件（counter）的主逻辑文件：
 * - 管理计数器的数据（名称、目标、当前值、历史记录、计时器等）
 * - 提供计数操作（加、减、重置）、目标设置、历史记录、计时器等功能
 * - 支持震动、声音、删除等交互
 * - 历史记录只保留最近20条，超出自动丢弃旧记录
 * - 组件数据持久化到本地 storage，支持多计数器独立存储
 */
