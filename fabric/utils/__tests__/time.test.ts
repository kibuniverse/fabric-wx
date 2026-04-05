// 时长计算与格式化逻辑测试

/**
 * 格式化针织总时长（与 me.ts 中的实现一致）
 */
function formatTotalTime(totalMs: number): string | number {
  const hours = totalMs / 3600000;
  const hoursFixed = parseFloat(hours.toFixed(1));
  const decimalPart = hoursFixed - Math.floor(hoursFixed);
  if (decimalPart > 0) {
    return hoursFixed.toFixed(1);
  }
  return Math.floor(hoursFixed);
}

/**
 * 格式化计时器显示（与 counter 组件中的实现一致）
 */
function formatTimerDisplay(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`;
}

/**
 * 计算空闲时间
 */
function calculateIdleTime(lastActivityTime: number, currentTime: number): number {
  return currentTime - lastActivityTime;
}

/**
 * 检查是否空闲超时
 */
function isIdleTimeout(idleTime: number, timeoutMs: number = 10 * 60 * 1000): boolean {
  return idleTime >= timeoutMs;
}

/**
 * 计算会话时长
 */
function calculateSessionTime(sessionStart: number, sessionElapsed: number, isRunning: boolean, currentTime: number): number {
  if (!isRunning) {
    return sessionElapsed;
  }
  return sessionElapsed + (currentTime - sessionStart);
}

/**
 * 使用 max 策略合并时长（避免旧数据覆盖新数据）
 */
function mergeTimeWithMax(localTime: number, cloudTime: number): number {
  return Math.max(localTime, cloudTime);
}

describe('时长计算与格式化', () => {
  describe('formatTotalTime', () => {
    it('0分钟应返回0', () => {
      expect(formatTotalTime(0)).toBe(0);
    });

    it('30分钟应返回0.5', () => {
      expect(formatTotalTime(30 * 60 * 1000)).toBe('0.5');
    });

    it('60分钟应返回1', () => {
      expect(formatTotalTime(60 * 60 * 1000)).toBe(1);
    });

    it('90分钟应返回1.5', () => {
      expect(formatTotalTime(90 * 60 * 1000)).toBe('1.5');
    });

    it('120分钟应返回2', () => {
      expect(formatTotalTime(120 * 60 * 1000)).toBe(2);
    });

    it('123分钟应返回2.0或2', () => {
      // 123分钟 = 2.05小时，parseFloat后小数部分为0，返回整数
      const result = formatTotalTime(123 * 60 * 1000);
      expect(result === 2 || result === '2.0').toBe(true);
    });

    it('毫秒数应正确转换', () => {
      // 1小时30分15秒 = 5415000毫秒
      expect(formatTotalTime(5415000)).toBe('1.5');
    });
  });

  describe('formatTimerDisplay', () => {
    it('0秒应返回00:00:00', () => {
      expect(formatTimerDisplay(0)).toBe('00 : 00 : 00');
    });

    it('1秒应返回00:00:01', () => {
      expect(formatTimerDisplay(1000)).toBe('00 : 00 : 01');
    });

    it('59秒应返回00:00:59', () => {
      expect(formatTimerDisplay(59 * 1000)).toBe('00 : 00 : 59');
    });

    it('1分钟应返回00:01:00', () => {
      expect(formatTimerDisplay(60 * 1000)).toBe('00 : 01 : 00');
    });

    it('1小时应返回01:00:00', () => {
      expect(formatTimerDisplay(3600 * 1000)).toBe('01 : 00 : 00');
    });

    it('1小时30分45秒应返回01:30:45', () => {
      expect(formatTimerDisplay(3600 * 1000 + 30 * 60 * 1000 + 45 * 1000)).toBe('01 : 30 : 45');
    });

    it('10小时应返回10:00:00', () => {
      expect(formatTimerDisplay(10 * 3600 * 1000)).toBe('10 : 00 : 00');
    });
  });

  describe('空闲时间计算', () => {
    it('应正确计算空闲时间', () => {
      const lastActivity = Date.now() - 5 * 60 * 1000; // 5分钟前
      const currentTime = Date.now();
      const idleTime = calculateIdleTime(lastActivity, currentTime);
      expect(idleTime).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100);
      expect(idleTime).toBeLessThanOrEqual(5 * 60 * 1000 + 100);
    });

    it('刚操作后空闲时间应为0', () => {
      const now = Date.now();
      expect(calculateIdleTime(now, now)).toBe(0);
    });
  });

  describe('空闲超时检测', () => {
    const TIMEOUT = 10 * 60 * 1000; // 10分钟

    it('空闲9分钟不应超时', () => {
      expect(isIdleTimeout(9 * 60 * 1000, TIMEOUT)).toBe(false);
    });

    it('空闲10分钟应超时', () => {
      expect(isIdleTimeout(10 * 60 * 1000, TIMEOUT)).toBe(true);
    });

    it('空闲15分钟应超时', () => {
      expect(isIdleTimeout(15 * 60 * 1000, TIMEOUT)).toBe(true);
    });

    it('空闲0分钟不应超时', () => {
      expect(isIdleTimeout(0, TIMEOUT)).toBe(false);
    });
  });

  describe('会话时长计算', () => {
    it('未运行时应返回已累计时长', () => {
      const result = calculateSessionTime(0, 5000, false, Date.now());
      expect(result).toBe(5000);
    });

    it('运行中应计算当前时长', () => {
      const start = Date.now() - 10000; // 10秒前开始
      const elapsed = 0;
      const current = Date.now();
      const result = calculateSessionTime(start, elapsed, true, current);
      expect(result).toBeGreaterThanOrEqual(10000 - 50);
      expect(result).toBeLessThanOrEqual(10000 + 50);
    });

    it('运行中且有累计时长应累加', () => {
      const start = Date.now() - 10000;
      const elapsed = 5000; // 已累计5秒
      const current = Date.now();
      const result = calculateSessionTime(start, elapsed, true, current);
      expect(result).toBeGreaterThanOrEqual(15000 - 50);
      expect(result).toBeLessThanOrEqual(15000 + 50);
    });
  });

  describe('时长合并策略', () => {
    it('本地大于云端时应保留本地', () => {
      expect(mergeTimeWithMax(10000, 5000)).toBe(10000);
    });

    it('云端大于本地时应保留云端', () => {
      expect(mergeTimeWithMax(5000, 10000)).toBe(10000);
    });

    it('两者相等时应返回该值', () => {
      expect(mergeTimeWithMax(5000, 5000)).toBe(5000);
    });

    it('本地为0时应返回云端值', () => {
      expect(mergeTimeWithMax(0, 10000)).toBe(10000);
    });

    it('云端为0时应返回本地值', () => {
      expect(mergeTimeWithMax(10000, 0)).toBe(10000);
    });

    it('两者都为0时应返回0', () => {
      expect(mergeTimeWithMax(0, 0)).toBe(0);
    });
  });
});