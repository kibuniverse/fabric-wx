/**
 * 计时器恢复逻辑单元测试
 * 测试场景：用户离开页面后计时器自动暂停，回来时不再弹窗、不恢复计时
 * 核心逻辑：pauseTimerAndMark → clearWasRunning
 */

describe('计时器恢复逻辑', () => {
  // 模拟计数器组件的 timerState
  function createTimerState(overrides: Partial<{
    startTimestamp: number;
    elapsedTime: number;
    wasRunning: boolean;
    idlePaused: boolean;
  }> = {}) {
    return {
      startTimestamp: 0,
      elapsedTime: 0,
      wasRunning: false,
      idlePaused: false,
      ...overrides,
    };
  }

  // 模拟 pauseTimerAndMark 的核心逻辑
  function pauseTimerAndMark(state: {
    isTimerRunning: boolean;
    timerState: ReturnType<typeof createTimerState>;
  }): {
    isTimerRunning: boolean;
    timerState: ReturnType<typeof createTimerState>;
  } {
    if (state.isTimerRunning) {
      return {
        isTimerRunning: false,
        timerState: {
          ...state.timerState,
          wasRunning: true,
        },
      };
    }
    return state;
  }

  // 模拟 clearWasRunning 的核心逻辑
  function clearWasRunning(timerState: ReturnType<typeof createTimerState>): ReturnType<typeof createTimerState> {
    if (timerState.wasRunning) {
      return {
        ...timerState,
        wasRunning: false,
      };
    }
    return timerState;
  }

  describe('pauseTimerAndMark - 离开时暂停并标记', () => {
    it('计时运行中：应暂停并标记 wasRunning=true', () => {
      const state = {
        isTimerRunning: true,
        timerState: createTimerState({ elapsedTime: 5000 }),
      };
      const result = pauseTimerAndMark(state);
      expect(result.isTimerRunning).toBe(false);
      expect(result.timerState.wasRunning).toBe(true);
      expect(result.timerState.elapsedTime).toBe(5000); // 已累积时长保留
    });

    it('计时未运行：不应改变状态', () => {
      const state = {
        isTimerRunning: false,
        timerState: createTimerState({ wasRunning: false }),
      };
      const result = pauseTimerAndMark(state);
      expect(result.timerState.wasRunning).toBe(false);
    });

    it('计时未运行但 wasRunning=true（已暂停过）：不应覆盖标记', () => {
      const state = {
        isTimerRunning: false,
        timerState: createTimerState({ wasRunning: true }),
      };
      const result = pauseTimerAndMark(state);
      expect(result.timerState.wasRunning).toBe(true);
    });
  });

  describe('clearWasRunning - 回来时静默清除标记', () => {
    it('wasRunning=true 时应清除', () => {
      const timerState = createTimerState({ wasRunning: true, elapsedTime: 3000 });
      const result = clearWasRunning(timerState);
      expect(result.wasRunning).toBe(false);
      expect(result.elapsedTime).toBe(3000); // 已累积时长不受影响
    });

    it('wasRunning=false 时不应改变', () => {
      const timerState = createTimerState({ wasRunning: false });
      const result = clearWasRunning(timerState);
      expect(result.wasRunning).toBe(false);
    });
  });

  describe('完整流程：离开 → 回来', () => {
    it('离开再回来，计时器保持暂停、不恢复', () => {
      // 初始状态：计时运行中
      let state = {
        isTimerRunning: true,
        timerState: createTimerState({ elapsedTime: 10000 }),
      };

      // 1. 离开页面
      state = pauseTimerAndMark(state);
      expect(state.isTimerRunning).toBe(false);
      expect(state.timerState.wasRunning).toBe(true);
      expect(state.timerState.elapsedTime).toBe(10000);

      // 2. 回到页面：清除标记，不弹窗，不恢复
      state.timerState = clearWasRunning(state.timerState);
      expect(state.timerState.wasRunning).toBe(false);
      expect(state.isTimerRunning).toBe(false); // 计时器仍处于暂停状态
    });

    it('未运行时离开再回来，状态不变', () => {
      let state = {
        isTimerRunning: false,
        timerState: createTimerState({ wasRunning: false, elapsedTime: 0 }),
      };

      state = pauseTimerAndMark(state);
      state.timerState = clearWasRunning(state.timerState);

      expect(state.isTimerRunning).toBe(false);
      expect(state.timerState.wasRunning).toBe(false);
    });

    it('多次离开回来循环，已累积时长持续保留', () => {
      let state = {
        isTimerRunning: true,
        timerState: createTimerState({ elapsedTime: 5000 }),
      };

      // 第一轮：离开 → 回来
      state = pauseTimerAndMark(state);
      state.timerState = clearWasRunning(state.timerState);
      expect(state.timerState.elapsedTime).toBe(5000);

      // 用户操作后计时器重新运行（模拟新的计时段）
      state.isTimerRunning = true;
      state.timerState.elapsedTime = 8000;

      // 第二轮：离开 → 回来
      state = pauseTimerAndMark(state);
      state.timerState = clearWasRunning(state.timerState);
      expect(state.timerState.elapsedTime).toBe(8000);
    });
  });

  describe('Tab 切换场景', () => {
    it('切换走：暂停当前 Tab；切换回：清除标记不恢复', () => {
      // Tab A 状态
      let tabA = {
        isTimerRunning: true,
        timerState: createTimerState({ elapsedTime: 2000 }),
      };

      // 切换走
      tabA = pauseTimerAndMark(tabA);
      expect(tabA.isTimerRunning).toBe(false);
      expect(tabA.timerState.wasRunning).toBe(true);

      // 切换回
      tabA.timerState = clearWasRunning(tabA.timerState);
      expect(tabA.timerState.wasRunning).toBe(false);
      expect(tabA.isTimerRunning).toBe(false);
    });

    it('多个 Tab 独立管理 wasRunning', () => {
      const tabA = {
        isTimerRunning: true,
        timerState: createTimerState({ elapsedTime: 1000 }),
      };
      const tabB = {
        isTimerRunning: false,
        timerState: createTimerState({ wasRunning: false, elapsedTime: 0 }),
      };

      // 从 A 切到 B：暂停 A
      const tabAPaused = pauseTimerAndMark(tabA);
      expect(tabAPaused.timerState.wasRunning).toBe(true);

      // B 本来没在计时，状态不变
      const tabBResult = pauseTimerAndMark(tabB);
      expect(tabBResult.timerState.wasRunning).toBe(false);

      // 切回 A：清除标记
      tabAPaused.timerState = clearWasRunning(tabAPaused.timerState);
      expect(tabAPaused.timerState.wasRunning).toBe(false);
    });
  });

  describe('空闲暂停不受影响', () => {
    it('空闲暂停标记 idlePaused 与 wasRunning 互不干扰', () => {
      // 空闲暂停后，wasRunning 和 idlePaused 都为 true
      const idleState = createTimerState({
        wasRunning: true,
        idlePaused: true,
        elapsedTime: 5000,
      });

      // clearWasRunning 只清除 wasRunning，不影响 idlePaused
      const result = clearWasRunning(idleState);
      expect(result.wasRunning).toBe(false);
      expect(result.idlePaused).toBe(true);
      expect(result.elapsedTime).toBe(5000);
    });
  });
});
