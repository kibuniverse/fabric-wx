import { vibrate } from '../../utils/vibrate';

interface CounterData {
  name: string;
  targetCount: number;
  currentCount: number;
  startTime: number;
  history: Array<{
    time: string;
    action: string;
    count: number;
  }>;
  timerState: {
    isRunning: boolean;
    startTimestamp: number;
    elapsedTime: number;
  };
}

const DEFAULT_COUNTER_DATA: CounterData = {
  name: '默认计数器',
  targetCount: 999,
  currentCount: 0,
  startTime: 0,
  history: [],
  timerState: {
    isRunning: false,
    startTimestamp: 0,
    elapsedTime: 0
  }
};

Component({
  properties: {
    vibrationOn: {
      type: Boolean,
      value: false
    },
    voiceOn: {
      type: Boolean,
      value: false
    },
    storageKey: {
      type: String,
      value: 'default_counter'
    },
    onDelete: {
      type: Function,
      value: null
    }
  },

  data: {
    counterData: DEFAULT_COUNTER_DATA,
    displayNumbers: [0],
    currentIndex: 0,
    timerDisplay: '00:00:00',
    isTimerRunning: false,
    timerInterval: 0,
    showTargetInput: false,
    targetInputValue: ''
  },

  lifetimes: {
    attached() {
      this.loadCounterData();
      // 如果计时器之前在运行，恢复计时器状态
      const counterData = this.data.counterData;
      if (counterData && counterData.timerState && counterData.timerState.isRunning) {
        const elapsedTime = counterData.timerState.elapsedTime;
        const timeSinceLastStop = counterData.timerState.startTimestamp ? 
          Date.now() - counterData.timerState.startTimestamp : 0;
        const totalElapsed = elapsedTime + timeSinceLastStop;
        
        this.setData({
          timerDisplay: this.formatTime(totalElapsed),
          isTimerRunning: true
        });
        
        this.startTimer(totalElapsed);
      }
      this.updateDisplayNumbers();
    },

    detached() {
      if (this.data.timerInterval) {
        clearInterval(this.data.timerInterval);
      }
    }
  },

  methods: {
    loadCounterData() {
      try {
        const key = this.properties.storageKey;
        const savedData = wx.getStorageSync(key);
        if (savedData) {
          // 确保有 timerState 字段
          const counterData = {
            ...DEFAULT_COUNTER_DATA,
            ...savedData,
            timerState: {
              ...DEFAULT_COUNTER_DATA.timerState,
              ...(savedData.timerState || {})
            }
          };
          this.setData({ counterData });
        }
      } catch (error) {
        console.error('Failed to load counter data:', error);
      }
    },

    saveCounterData() {
      wx.setStorageSync(this.properties.storageKey, this.data.counterData);
    },

    updateDisplayNumbers() {
      const currentCount = this.data.counterData.currentCount;
      const numbers = [currentCount];
      this.setData({
        displayNumbers: numbers,
        currentIndex: 0
      });
    },

    formatTime(milliseconds: number): string {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      const pad = (num: number) => num.toString().padStart(2, '0');
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    },

    addHistory(action: string) {
      const now = new Date();
      const timeString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const newHistory = [{
        time: timeString,
        action,
        count: this.data.counterData.currentCount
      }, ...this.data.counterData.history].slice(0, 50);

      this.setData({
        'counterData.history': newHistory
      });
      this.saveCounterData();
    },

    async increase() {
      if (this.data.counterData.currentCount >= this.data.counterData.targetCount) {
        wx.showToast({
          title: '已达到目标行数',
          icon: 'none'
        });
        return;
      }

      const newCount = this.data.counterData.currentCount + 1;
      this.setData({
        'counterData.currentCount': newCount
      });
      this.updateDisplayNumbers();
      this.addHistory('行+1');

      if (this.properties.vibrationOn) {
        try {
          await vibrate('medium');
        } catch (error) {
          console.error('Vibration failed:', error);
        }
      }

      if (this.properties.voiceOn) {
        // TODO: 实现声音播放
      }
    },

    async decrease() {
      if (this.data.counterData.currentCount <= 0) {
        wx.showToast({
          title: '已经是最小值了',
          icon: 'none'
        });
        return;
      }

      const newCount = this.data.counterData.currentCount - 1;
      this.setData({
        'counterData.currentCount': newCount
      });
      this.updateDisplayNumbers();
      this.addHistory('行-1');

      if (this.properties.vibrationOn) {
        try {
          await vibrate('medium');
        } catch (error) {
          console.error('Vibration failed:', error);
        }
      }

      if (this.properties.voiceOn) {
        // TODO: 实现声音播放
      }
    },

    showResetConfirm() {
      wx.showModal({
        title: '确认重置',
        content: '是否确认重置计数器？',
        success: async (res) => {
          if (res.confirm) {
            this.setData({
              'counterData.currentCount': 0,
              'counterData.startTime': 0,
              timerDisplay: '00:00:00',
              isTimerRunning: false
            });
            this.updateDisplayNumbers();
            this.addHistory('重置');

            if (this.properties.vibrationOn) {
              try {
                await vibrate('heavy');
              } catch (error) {
                console.error('Vibration failed:', error);
              }
            }

            if (this.data.timerInterval) {
              clearInterval(this.data.timerInterval);
              this.setData({ timerInterval: 0 });
            }
          }
        }
      });
    },

    toggleTimer() {
      if (this.data.isTimerRunning) {
        // 停止计时器
        clearInterval(this.data.timerInterval);
        
        // 更新持久化状态
        const counterData = this.data.counterData;
        counterData.timerState.isRunning = false;
        counterData.timerState.elapsedTime = this.getCurrentElapsedTime();
        counterData.timerState.startTimestamp = 0;
        
        this.setData({
          isTimerRunning: false,
          counterData
        });
        
        this.saveCounterData();
      } else {
        // 开始计时器
        const startTime = Date.now();
        const elapsedTime = this.data.counterData.timerState.elapsedTime || 0;
        
        // 更新持久化状态
        const counterData = this.data.counterData;
        counterData.timerState.isRunning = true;
        counterData.timerState.startTimestamp = startTime;
        
        this.setData({
          isTimerRunning: true,
          counterData
        });
        
        this.startTimer(elapsedTime);
        this.saveCounterData();
      }
    },

    startTimer(initialElapsed: number = 0) {
      const startTimestamp = Date.now();
      const timerInterval = setInterval(() => {
        const currentTime = Date.now();
        const elapsed = initialElapsed + (currentTime - startTimestamp);
        this.setData({
          timerDisplay: this.formatTime(elapsed)
        });
      }, 1000);
      
      this.setData({ timerInterval });
    },

    getCurrentElapsedTime(): number {
      if (!this.data.counterData.timerState.startTimestamp) {
        return this.data.counterData.timerState.elapsedTime || 0;
      }
      const timeSinceStart = Date.now() - this.data.counterData.timerState.startTimestamp;
      return (this.data.counterData.timerState.elapsedTime || 0) + timeSinceStart;
    },

    showTargetInput() {
      this.setData({
        showTargetInput: true,
        targetInputValue: String(this.data.counterData.targetCount)
      });
    },

    onTargetInput(e: any) {
      this.setData({
        targetInputValue: e.detail.value
      });
    },

    cancelTargetInput() {
      this.setData({
        showTargetInput: false,
        targetInputValue: ''
      });
    },

    confirmTargetInput() {
      const value = parseInt(this.data.targetInputValue);
      if (isNaN(value)) {
        wx.showToast({
          title: '请输入有效数字',
          icon: 'none'
        });
        return;
      }

      if (value < 0) {
        wx.showToast({
          title: '目标行数不能小于0',
          icon: 'none'
        });
        return;
      }

      if (value > 999) {
        wx.showToast({
          title: '目标行数不能超过999',
          icon: 'none'
        });
        return;
      }

      this.setData({
        'counterData.targetCount': value,
        showTargetInput: false,
        targetInputValue: ''
      });
      this.saveCounterData();
    },

    clearHistory() {
      // Add fade-out animation before clearing
      const historyList = this.data.counterData.history;
      if (historyList.length === 0) return;

      const historyItems = wx.createSelectorQuery()
        .in(this)
        .selectAll('.history-item');

      historyItems.fields({ dataset: true }, (res) => {
        // Add fade-out class to all history items
        res.forEach((item, index) => {
          const historyItem = this.selectComponent(`.history-item:nth-child(${index + 1})`);
          historyItem.setData({ 'fadeOut': true });
        });

        // Clear history after animation
        setTimeout(() => {
          this.setData({
            'counterData.history': []
          });
          this.saveCounterData();
        }, 500); // Match the animation duration
      }).exec();
    },

    handleCounterDelete() {
      // Trigger the onDelete callback if provided
      if (this.data.onDelete && typeof this.data.onDelete === 'function') {
        this.data.onDelete();
      } else {
        // Fallback to showing a toast if no specific delete handler is provided
        wx.showToast({
          title: '无法删除计数器',
          icon: 'none'
        });
      }
    }
  }
});
