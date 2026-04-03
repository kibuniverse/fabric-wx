// 计数器数据处理逻辑测试

// 默认计数器数据结构
const DEFAULT_COUNTER_DATA = {
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
};

/**
 * 验证计数器数据结构
 */
function validateCounterData(data: any): boolean {
  if (!data) return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.targetCount !== 'number') return false;
  if (typeof data.currentCount !== 'number') return false;
  if (!Array.isArray(data.history)) return false;
  if (!data.timerState || typeof data.timerState.elapsedTime !== 'number') return false;
  return true;
}

/**
 * 合并计数器数据（基于 updatedAt）
 */
function mergeCounterData(localData: any, cloudData: any): any {
  if (!localData && !cloudData) return DEFAULT_COUNTER_DATA;
  if (!localData) return cloudData;
  if (!cloudData) return localData;

  const localTime = localData.updatedAt || 0;
  const cloudTime = cloudData.updatedAt || 0;

  if (localTime >= cloudTime) {
    return localData;
  }
  return cloudData;
}

/**
 * 合并计数器列表
 */
function mergeCounterKeys(
  localKeys: string[],
  cloudKeys: string[]
): string[] {
  const combined = [...localKeys, ...cloudKeys];
  return [...new Set(combined)]; // 去重
}

/**
 * 历史记录排序（最新的在前）
 */
function sortHistory(history: any[]): any[] {
  return [...history].sort((a, b) => (b.id || 0) - (a.id || 0));
}

/**
 * 限制历史记录数量（最多20条）
 */
function limitHistory(history: any[], maxCount: number = 20): any[] {
  const sorted = sortHistory(history);
  return sorted.slice(0, maxCount);
}

/**
 * 计数范围验证
 */
function validateCount(count: number, min: number = 0, max: number = 999): { valid: boolean; value: number } {
  if (count < min) return { valid: false, value: min };
  if (count > max) return { valid: false, value: max };
  return { valid: true, value: count };
}

describe('计数器数据处理', () => {
  describe('validateCounterData', () => {
    it('有效数据应返回 true', () => {
      expect(validateCounterData(DEFAULT_COUNTER_DATA)).toBe(true);
    });

    it('null 应返回 false', () => {
      expect(validateCounterData(null)).toBe(false);
    });

    it('缺少 name 应返回 false', () => {
      expect(validateCounterData({ ...DEFAULT_COUNTER_DATA, name: undefined })).toBe(false);
    });

    it('缺少 history 应返回 false', () => {
      expect(validateCounterData({ ...DEFAULT_COUNTER_DATA, history: undefined })).toBe(false);
    });

    it('history 不是数组应返回 false', () => {
      expect(validateCounterData({ ...DEFAULT_COUNTER_DATA, history: {} })).toBe(false);
    });

    it('缺少 timerState 应返回 false', () => {
      expect(validateCounterData({ ...DEFAULT_COUNTER_DATA, timerState: undefined })).toBe(false);
    });
  });

  describe('mergeCounterData', () => {
    it('本地更新时应返回本地数据', () => {
      const local = { ...DEFAULT_COUNTER_DATA, currentCount: 10, updatedAt: Date.now() };
      const cloud = { ...DEFAULT_COUNTER_DATA, currentCount: 5, updatedAt: Date.now() - 1000 };

      const result = mergeCounterData(local, cloud);
      expect(result.currentCount).toBe(10);
    });

    it('云端更新时应返回云端数据', () => {
      const local = { ...DEFAULT_COUNTER_DATA, currentCount: 5, updatedAt: Date.now() - 1000 };
      const cloud = { ...DEFAULT_COUNTER_DATA, currentCount: 20, updatedAt: Date.now() };

      const result = mergeCounterData(local, cloud);
      expect(result.currentCount).toBe(20);
    });

    it('本地无数据时应返回云端数据', () => {
      const cloud = { ...DEFAULT_COUNTER_DATA, currentCount: 10 };

      const result = mergeCounterData(null, cloud);
      expect(result.currentCount).toBe(10);
    });

    it('云端无数据时应返回本地数据', () => {
      const local = { ...DEFAULT_COUNTER_DATA, currentCount: 10 };

      const result = mergeCounterData(local, null);
      expect(result.currentCount).toBe(10);
    });

    it('两者都无数据时应返回默认数据', () => {
      const result = mergeCounterData(null, null);
      expect(result.name).toBe('默认计数器');
    });
  });

  describe('mergeCounterKeys', () => {
    it('应合并并去重', () => {
      const local = ['counter_1', 'counter_2'];
      const cloud = ['counter_2', 'counter_3'];

      const result = mergeCounterKeys(local, cloud);
      expect(result).toEqual(['counter_1', 'counter_2', 'counter_3']);
    });

    it('本地空数组应返回云端数组', () => {
      const result = mergeCounterKeys([], ['counter_1']);
      expect(result).toEqual(['counter_1']);
    });

    it('云端空数组应返回本地数组', () => {
      const result = mergeCounterKeys(['counter_1'], []);
      expect(result).toEqual(['counter_1']);
    });

    it('两者都空应返回空数组', () => {
      const result = mergeCounterKeys([], []);
      expect(result).toEqual([]);
    });
  });

  describe('sortHistory', () => {
    it('应按 id 降序排列', () => {
      const history = [
        { id: 1, action: 'add' },
        { id: 3, action: 'subtract' },
        { id: 2, action: 'add' },
      ];

      const result = sortHistory(history);
      expect(result[0].id).toBe(3);
      expect(result[1].id).toBe(2);
      expect(result[2].id).toBe(1);
    });

    it('空数组应返回空数组', () => {
      expect(sortHistory([])).toEqual([]);
    });

    it('单个元素应保持不变', () => {
      const history = [{ id: 1, action: 'add' }];
      expect(sortHistory(history)).toEqual(history);
    });
  });

  describe('limitHistory', () => {
    it('超过20条应截断', () => {
      const history = Array.from({ length: 30 }, (_, i) => ({ id: i, action: 'add' }));

      const result = limitHistory(history);
      expect(result.length).toBe(20);
      // 应保留最新的（id 大的）
      expect(result[0].id).toBe(29);
    });

    it('少于20条应保持原样', () => {
      const history = Array.from({ length: 10 }, (_, i) => ({ id: i, action: 'add' }));

      const result = limitHistory(history);
      expect(result.length).toBe(10);
    });

    it('正好20条应保持原样', () => {
      const history = Array.from({ length: 20 }, (_, i) => ({ id: i, action: 'add' }));

      const result = limitHistory(history);
      expect(result.length).toBe(20);
    });

    it('空数组应返回空数组', () => {
      expect(limitHistory([])).toEqual([]);
    });
  });

  describe('validateCount', () => {
    it('有效计数应返回 valid: true', () => {
      const result = validateCount(50);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
    });

    it('低于最小值应返回 valid: false', () => {
      const result = validateCount(-5);
      expect(result.valid).toBe(false);
      expect(result.value).toBe(0);
    });

    it('高于最大值应返回 valid: false', () => {
      const result = validateCount(1000);
      expect(result.valid).toBe(false);
      expect(result.value).toBe(999);
    });

    it('边界值0应有效', () => {
      const result = validateCount(0);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('边界值999应有效', () => {
      const result = validateCount(999);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(999);
    });

    it('自定义范围应生效', () => {
      const result = validateCount(50, 10, 100);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
    });
  });
});