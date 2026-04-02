import { eventBus } from "../../utils/event_bus";
import { vibrate } from "../../utils/vibrate";

// pages/counter/counter.ts
const STORAGE_KEYS = {
  VIBRATION: "counter_vibration_state",
  KEEP_SCREEN: "counter_keep_screen_state",
  VOICE: "counter_voice_state",
  COUNTER_KEYS: "counter_keys",
  ACTIVE_KEY: "counter_active_key",
};

const defaultCounterKeys = ["local_default_counter"];

/** 监听是否有备忘录的修改 */
let isMemoModified = false;

Page({
  // 用于记录浮球移动的坐标
  moveX: 0,
  moveY: 0,
  // 平滑眼珠动画的当前值
  smoothEyeOffsetX: 0,
  smoothEyeOffsetY: 0,
  // 目标眼珠偏移
  targetEyeOffsetX: 0,
  targetEyeOffsetY: 0,
  // 动画帧 ID
  animationFrameId: 0 as number,
  // 按钮点击计时器
  buttonClickTimer: 0 as number,
  // 眨眼定时器
  blinkTimer: 0 as number,
  // 隐藏表情定时器（onTouchend 中使用）
  hideFaceTimer: 0 as number,

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
    // 计数器 key 列表（只存 key）
    counterKeys: [] as string[],
    // 计数器列表（用于渲染 Tab，包含 key 和 name）
    counterList: [] as { key: string; name: string }[],
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
    // 眼睛动画相关
    isDragging: false,
    eyeState: 'normal' as 'normal' | 'shocked',
    eyeOffsetX: 0,
    eyeOffsetY: 0,
    eyeScale: 1,
    // 按钮点击展示表情
    showFaceFromButton: false,
    // 眨眼动画
    isBlinking: false,
    // 登录引导弹窗
    showLoginPrompt: false,
  },

  // 在Page对象内新增方法
  initStorageSettings() {
    let keys = wx.getStorageSync(STORAGE_KEYS.COUNTER_KEYS);
    // 如果 Storage 中没有计数器数据，写入默认值
    // 注意：未登录用户使用 local_default_counter，登录用户使用正常的计数器
    if (!keys || keys.length === 0) {
      keys = ["local_default_counter"];
      wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, keys);
      // 同时写入默认计数器数据
      const defaultData = {
        name: "默认计数器",
        targetCount: 999,
        currentCount: 0,
        startTime: 0,
        history: [],
        timerState: {
          startTimestamp: 0,
          elapsedTime: 0,
          wasRunning: false,
        },
        memo: "",
        updatedAt: Date.now(),
      };
      wx.setStorageSync("local_default_counter", defaultData);
    }

    const activeKey = wx.getStorageSync(STORAGE_KEYS.ACTIVE_KEY) || "";

    // 兼容旧格式：确保 keys 是字符串数组
    const normalizedKeys = keys.map((k: any) => {
      if (typeof k === 'string') {
        return k;
      }
      return k.key || k;
    });

    // 如果存在旧格式数据，更新为新格式
    if (normalizedKeys.some((k, i) => k !== keys[i])) {
      wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, normalizedKeys);
    }

    // 构建 counterList（用于渲染 Tab）
    const counterList = normalizedKeys.map((key: string) => {
      const data = wx.getStorageSync(key);
      return { key, name: data?.name || "默认计数器" };
    });

    this.setData({
      counterKeys: normalizedKeys,
      counterList,
      activeKey,
      isVibrationOn: wx.getStorageSync(STORAGE_KEYS.VIBRATION) || false,
      isKeepScreenOn: wx.getStorageSync(STORAGE_KEYS.KEEP_SCREEN) || false,
      isVoiceOn: wx.getStorageSync(STORAGE_KEYS.VOICE) || false,
    });
  },

  // 根据 counterKeys 构建 counterList
  buildCounterList() {
    // 兼容旧格式：确保 counterKeys 是字符串数组
    const normalizedKeys = this.data.counterKeys.map((k: any) => {
      if (typeof k === 'string') {
        return k;
      }
      return k.key || k;
    });

    const counterList = normalizedKeys.map((key: string) => {
      const data = wx.getStorageSync(key);
      return { key, name: data?.name || "默认计数器" };
    });
    this.setData({ counterList, counterKeys: normalizedKeys });
  },

  // 平滑眼珠动画的当前值
  smoothEyeOffsetX: 0,
  smoothEyeOffsetY: 0,

  initKeepScreen() {
    wx.setKeepScreenOn({
      keepScreenOn: this.data.isKeepScreenOn,
    });
  },

  initEventListeners() {
    eventBus.on("onMemoContentChange", () => {
      isMemoModified = true;
    });
    // 监听计数器按钮点击事件
    eventBus.on("counterButtonClicked", ({ type, numberPosition }) => {
      this.handleCounterButtonClick(type, numberPosition);
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

    // 无论是否登录，都重新从 Storage 加载计数器列表
    const keys = wx.getStorageSync(STORAGE_KEYS.COUNTER_KEYS) || [];
    const activeKey = wx.getStorageSync(STORAGE_KEYS.ACTIVE_KEY) || "";

    // 兼容旧格式：确保 keys 是字符串数组
    const normalizedKeys = keys.map((k: any) => {
      if (typeof k === 'string') {
        return k;
      }
      return k.key || k;
    });

    // 构建 counterList
    const counterList = normalizedKeys.map((key: string) => {
      const data = wx.getStorageSync(key);
      return { key, name: data?.name || "默认计数器" };
    });
    this.setData({
      counterKeys: normalizedKeys,
      counterList,
      activeKey,
      activeTab: Math.min(this.data.activeTab, normalizedKeys.length - 1),
    });
    // 刷新所有计数器组件
    eventBus.emit('refreshCounter', { counterKey: 'all' });

    // 重新计算 Tab 布局（修复退出登录后 Indicator 位置错误）
    wx.nextTick(() => {
      this.selectComponent("#tabs")?.resize();
    });

    // 检查当前 Tab 是否需要显示恢复计时弹窗
    this.checkResumeTimerDialog();
    // 开始针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      // 先从云端同步最新数据（多设备同步），再开始计时
      app.syncFromCloud().catch(err => {
        console.error('[Counter] 同步云端数据失败:', err)
      })
      app.startKnittingSession();
      // 只有已登录才执行云同步和心跳
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn) {
        app.syncCounterData('sync').then(() => {
          // 同步完成后重新加载计数器列表
          const syncKeys = wx.getStorageSync(STORAGE_KEYS.COUNTER_KEYS) || [];
          const syncActiveKey = wx.getStorageSync(STORAGE_KEYS.ACTIVE_KEY) || "";

          // 兼容旧格式：确保 syncKeys 是字符串数组
          const normalizedSyncKeys = syncKeys.map((k: any) => {
            if (typeof k === 'string') {
              return k;
            }
            return k.key || k;
          });

          // 构建 counterList
          const syncCounterList = normalizedSyncKeys.map((key: string) => {
            const data = wx.getStorageSync(key);
            return { key, name: data?.name || "默认计数器" };
          });
          this.setData({
            counterKeys: normalizedSyncKeys,
            counterList: syncCounterList,
            activeKey: syncActiveKey,
            activeTab: Math.min(this.data.activeTab, normalizedSyncKeys.length - 1),
          });
          // 刷新所有计数器组件
          eventBus.emit('refreshCounter', { counterKey: 'all' });
          // 重新计算 Tab 布局（修复云同步后 Indicator 位置错误）
          wx.nextTick(() => {
            this.selectComponent("#tabs")?.resize();
          });
        }).catch(err => {
          console.error('[Counter] 同步计数器数据失败:', err)
        });
        app.startCounterHeartbeat();
      }
    }
  },

  onHide() {
    // 暂停针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      app.pauseKnittingSession(true);
      // 停止心跳并同步计数器数据
      app.stopCounterHeartbeat();
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn) {
        // 强制上传：等待当前同步完成后，再执行上传
        // 这样可以确保用户操作的数据不会丢失
        app.forceSyncCounterData('upload').catch(err => {
          console.error('[Counter] 同步计数器数据失败:', err)
        });
      }
    }
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
      const prevX = this.moveX;
      const prevY = this.moveY;
      this.moveX = e.detail.x;
      this.moveY = e.detail.y;

      // 计算眼睛动画
      const sys = wx.getSystemInfoSync();
      const tabBarHeight = 96 / 750 * this.data.floatBall.winW + (sys.screenHeight - sys.safeArea.bottom);
      const maxY = this.data.floatBall.winH - this.data.floatBall.ballH - tabBarHeight - 10;

      // 计算目标眼珠偏移 - 跟随拖动方向
      const maxOffset = 3;
      const sensitivity = 0.4;
      const deltaX = this.moveX - (prevX || this.data.floatBall.x);
      const deltaY = this.moveY - (prevY || this.data.floatBall.y);

      // 更新目标偏移
      this.targetEyeOffsetX = Math.max(-maxOffset, Math.min(maxOffset, deltaX * sensitivity));
      this.targetEyeOffsetY = Math.max(-maxOffset, Math.min(maxOffset, deltaY * sensitivity));

      // 检测是否触边（震惊效果）
      const isAtBottom = this.moveY >= maxY - 10;
      const isAtTop = this.moveY <= 10;
      const isAtEdge = isAtBottom || isAtTop;

      // 眼珠缩放（震惊时放大）
      const eyeScale = isAtEdge ? 1.4 : 1;

      // 使用平滑动画更新
      this.animateEye(isAtEdge, eyeScale);
    }
  },

  // 平滑动画更新眼珠位置
  animateEye(_isAtEdge: boolean, eyeScale: number) {
    // 如果已有动画帧在运行，先取消
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const animate = () => {
      // 确保拖动状态正确
      if (!this.data.isDragging) {
        return;
      }

      // 平滑插值 - 使用更平滑的缓动
      const smoothing = 0.2;
      this.smoothEyeOffsetX += (this.targetEyeOffsetX - this.smoothEyeOffsetX) * smoothing;
      this.smoothEyeOffsetY += (this.targetEyeOffsetY - this.smoothEyeOffsetY) * smoothing;

      // 检查是否接近目标
      const threshold = 0.05;
      const isCloseEnough =
        Math.abs(this.smoothEyeOffsetX - this.targetEyeOffsetX) < threshold &&
        Math.abs(this.smoothEyeOffsetY - this.targetEyeOffsetY) < threshold;

      if (isCloseEnough) {
        this.smoothEyeOffsetX = this.targetEyeOffsetX;
        this.smoothEyeOffsetY = this.targetEyeOffsetY;
      }

      this.setData({
        eyeOffsetX: this.smoothEyeOffsetX,
        eyeOffsetY: this.smoothEyeOffsetY,
        eyeScale,
        eyeState: 'shocked',
      });

      // 如果还没到达目标，继续动画
      if (!isCloseEnough && this.data.isDragging) {
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate();
  },

  // 处理计数器按钮点击，展示表情
  handleCounterButtonClick(_type: 'increase' | 'decrease', numberPosition: { x: number; y: number }) {
    // 如果已经在展示表情，先重置
    if (this.buttonClickTimer) {
      clearTimeout(this.buttonClickTimer);
    }

    // 延迟 0.4 秒后展现表情
    setTimeout(() => {
      // 获取悬浮球当前位置
      const query = wx.createSelectorQuery();
      query.select('#connect-ball').boundingClientRect();
      query.exec((res) => {
        const ballRect = res[0];
        if (!ballRect || !numberPosition) return;

        // 计算悬浮球中心位置
        const ballCenterX = ballRect.left + ballRect.width / 2;
        const ballCenterY = ballRect.top + ballRect.height / 2;

        // 计算眼睛偏移 - 眼睛看向数字位置
        const dx = numberPosition.x - ballCenterX;
        const dy = numberPosition.y - ballCenterY;

        // 根据距离计算偏移，限制在最大范围内
        const maxOffset = 3;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const normalizedX = distance > 0 ? dx / distance : 0;
        const normalizedY = distance > 0 ? dy / distance : 0;

        // 眼睛偏移方向
        const eyeOffsetX = normalizedX * maxOffset;
        const eyeOffsetY = normalizedY * maxOffset;

        this.setData({
          isDragging: true,
          showFaceFromButton: true,
          eyeOffsetX,
          eyeOffsetY,
          eyeScale: 1,
          eyeState: 'shocked',
        });

        // 启动眨眼动画
        this.startBlinkAnimation();

        // 1秒后隐藏表情
        this.buttonClickTimer = setTimeout(() => {
          this.stopBlinkAnimation();
          this.setData({
            isDragging: false,
            showFaceFromButton: false,
            eyeOffsetX: 0,
            eyeOffsetY: 0,
            eyeScale: 1,
            eyeState: 'normal',
          });
        }, 1000);
      });
    }, 200);
  },

  onTouchstart() {
    // 取消之前的动画
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // 清除按钮点击的定时器，防止意外重置 isDragging
    if (this.buttonClickTimer) {
      clearTimeout(this.buttonClickTimer);
      this.buttonClickTimer = 0;
    }

    // 清除隐藏表情的定时器，防止拖动过程中表情消失
    if (this.hideFaceTimer) {
      clearTimeout(this.hideFaceTimer);
      this.hideFaceTimer = 0;
    }

    this.smoothEyeOffsetX = 0;
    this.smoothEyeOffsetY = 0;
    this.targetEyeOffsetX = 0;
    this.targetEyeOffsetY = 0;
    this.setData({
      isDragging: true,
      showFaceFromButton: false,
      eyeOffsetX: 0,
      eyeOffsetY: 0,
    });
    // 启动眨眼动画
    this.startBlinkAnimation();
  },

  onTouchend() {
    // 取消动画帧
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }

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

    // 延时隐藏表情，等吸边动画完全停止后1秒再切换
    this.hideFaceTimer = setTimeout(() => {
      this.smoothEyeOffsetX = 0;
      this.smoothEyeOffsetY = 0;
      this.targetEyeOffsetX = 0;
      this.targetEyeOffsetY = 0;
      this.stopBlinkAnimation();
      this.setData({
        isDragging: false,
        eyeOffsetX: 0,
        eyeOffsetY: 0,
        eyeScale: 1,
        eyeState: 'normal',
      });
    }, 1300);

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

    // 重置心跳计时器
    const app = getApp<IAppOption>();
    if (app) {
      app.resetCounterHeartbeat();
    }

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
    // 检查是否已登录
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      // 未登录，显示登录引导弹窗
      this.setData({ showLoginPrompt: true });
      return;
    }
    this.setData({
      showAddCounter: true,
      newCounterName: "",
    });
  },

  // 关闭登录引导弹窗
  onCloseLoginPrompt() {
    this.setData({ showLoginPrompt: false });
  },

  // 去登录
  goToLogin() {
    this.setData({ showLoginPrompt: false });
    wx.switchTab({ url: '/pages/me/me' });
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

  onCloseAddCounter() {
    this.setData({
      showAddCounter: false,
      newCounterName: "",
    });
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

    // 添加新计数器（只存 key）
    const newCounterKeys = [...this.data.counterKeys, newKey];

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
      updatedAt: Date.now(), // 新建时设置时间戳
    };
    wx.setStorageSync(newKey, DEFAULT_COUNTER_DATA);

    // 构建 counterList
    const newCounterList = [...this.data.counterList, { key: newKey, name: newCounterName.trim() }];

    this.setData({
      counterKeys: newCounterKeys,
      counterList: newCounterList,
      showAddCounter: false,
      activeTab: newCounterKeys.length - 1, // 切换到新添加的计数器
    });

    // 重新计算 Tab 布局
    wx.nextTick(() => {
      this.selectComponent("#tabs")?.resize();
    });

    this.showToast("计数器添加成功");

    // 同步到云端
    const app = getApp<IAppOption>();
    if (app) {
      app.syncCounterData('upload').catch(err => {
        console.error('[Counter] 同步计数器数据失败:', err)
      });
      app.resetCounterHeartbeat();
    }
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
          const counterKeys = this.data.counterKeys;
          // 获取被删除计数器的名称
          const deletedCounter = this.data.counterList.find(
            (item) => item.key === counterId
          );
          const deletedCounterName = deletedCounter?.name;

          // 找到被删除的计数器在原数组中的索引
          const deletedIndex = this.data.counterKeys.findIndex(
            (key) => key === counterId
          );
          // 删除 counterKeys 中的 key
          const newCounterKeys = this.data.counterKeys.filter(
            (key) => key !== counterId
          );
          wx.setStorageSync(STORAGE_KEYS.COUNTER_KEYS, newCounterKeys);

          // 清理计数器相关数据
          wx.removeStorageSync(counterId); // 计数器数据
          wx.removeStorageSync(`memo_${counterId}_lastModified`); // 备忘录修改时间

          // 更新 counterList
          const newCounterList = this.data.counterList.filter(
            (item) => item.key !== counterId
          );
          this.setData({
            counterKeys: newCounterKeys,
            counterList: newCounterList,
          });

          // 如果删除的是第一个计数器，则激活第二个计数器（新的第一个）
          // 否则激活被删除计数器的前一个
          let newActiveTab = deletedIndex === 0 ? 0 : deletedIndex - 1;
          // 确保索引有效
          newActiveTab = Math.min(newActiveTab, newCounterKeys.length - 1);
          this.setData({ activeTab: newActiveTab });
          this.showToast(`计数器 ${deletedCounterName} 已删除`);
          this.selectComponent("#tabs").resize();
          // 如果删除的计数器是子计数器绑定的计数器，则关闭子计数器
          if (
            this.data.showRepeatCounter &&
            this.data.childCounterParentTab === deletedIndex
          ) {
            this.onCloseRepeatCounter();
          }

          // 同步到云端
          const app = getApp<IAppOption>();
          if (app) {
            app.syncCounterData('upload').catch(err => {
              console.error('[Counter] 同步计数器数据失败:', err)
            });
            app.resetCounterHeartbeat();
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

    // 只更新计数器数据的 name 和 updatedAt
    const counterData = wx.getStorageSync(this.data.currentEditingKey);
    if (counterData) {
      counterData.name = newName;
      counterData.updatedAt = Date.now(); // 更新时间戳，确保云同步时使用新名称
      wx.setStorageSync(this.data.currentEditingKey, counterData);
    }

    // 更新 counterList 中的 name
    const newCounterList = this.data.counterList.map((item) => {
      if (item.key === this.data.currentEditingKey) {
        return { ...item, name: newName };
      }
      return item;
    });
    this.setData({ counterList: newCounterList });

    eventBus.emit('refreshCounter', { counterKey: this.data.currentEditingKey });
    this.setData({
      showModifyCounterName: false
    });
    this.selectComponent("#tabs").resize();

    // 触发云同步，确保名称变更立即上传
    const app = getApp<IAppOption>();
    if (app) {
      app.syncCounterData('upload').catch(err => {
        console.error('[Counter] 同步计数器名称失败:', err)
      });
      app.resetCounterHeartbeat();
    }
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

  // 启动眨眼动画
  startBlinkAnimation() {
    // 先清除之前的定时器
    this.stopBlinkAnimation();

    // 随机间隔眨眼（2-4秒之间）
    const scheduleNextBlink = () => {
      const delay = 2000 + Math.random() * 2000;
      this.blinkTimer = setTimeout(() => {
        this.doBlink();
        scheduleNextBlink();
      }, delay);
    };

    scheduleNextBlink();
  },

  // 停止眨眼动画
  stopBlinkAnimation() {
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
      this.blinkTimer = 0;
    }
  },

  // 执行眨眼
  doBlink() {
    // 只在表情显示时眨眼
    if (!this.data.isDragging && !this.data.showFaceFromButton) {
      return;
    }

    this.setData({ isBlinking: true });

    // 眨眼持续 150ms
    setTimeout(() => {
      this.setData({ isBlinking: false });
    }, 150);
  },


});
