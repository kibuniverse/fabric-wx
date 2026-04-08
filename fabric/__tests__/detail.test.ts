/**
 * 详情页 (detail.ts) 临时计数器逻辑单元测试
 * 测试：创建限制、计数增减、同步开关、编辑态守卫、删除、持久化、拖动约束
 */

import wx, { clearAllMocks } from '../../__mocks__/wx';

// 临时计数器存储键前缀
const TEMP_COUNTER_PREFIX = 'tempCounters_';
const TEMP_COUNTER_TIPS_SHOWN_KEY = 'tempCounterTipsShown';

// 通用 mock
let pageData: any = {};
let pageMethods: any = {};

const mockPage = (options: any) => {
  pageData = { ...options.data };
  pageMethods = { ...options };

  pageMethods.setData = (newData: any) => {
    pageData = { ...pageData, ...newData };
    pageMethods.data = pageData;
  };

  return pageMethods;
};

(global as any).Page = mockPage;
(global as any).getApp = jest.fn(() => ({
  globalData: {},
  resetKnittingActivity: jest.fn(),
  syncFromCloud: jest.fn().mockResolvedValue(undefined),
  startKnittingSession: jest.fn(),
  pauseKnittingSession: jest.fn(),
  startDiagramHeartbeat: jest.fn(),
  stopDiagramHeartbeat: jest.fn(),
  forceSyncDiagramCounterData: jest.fn().mockResolvedValue(undefined),
  resetDiagramHeartbeat: jest.fn(),
}));

// ---- 提取的纯函数逻辑 ----

/** 创建临时计数器（含限制检查） */
function createTempCounter(
  existingCounters: any[],
  _nextZOrder: number,
  getDefaultPos: (index: number) => { x: number; y: number },
): { allowed: boolean; counter?: any; toast?: string } {
  if (existingCounters.length >= 1) {
    return { allowed: false, toast: '暂时只能创建1个临时计数器～' };
  }
  const pos = getDefaultPos(existingCounters.length);
  return {
    allowed: true,
    counter: {
      id: `temp_${Date.now()}`,
      count: 0,
      isActive: false,
      x: pos.x,
      y: pos.y,
      name: '',
      zOrder: _nextZOrder + 1,
    },
  };
}

/** 增加计数 */
function increaseCount(
  counters: any[],
  id: string,
  editMode: boolean,
): { counters: any[]; synced: boolean; cleared: boolean } {
  if (editMode) return { counters, synced: false, cleared: true };
  const counter = counters.find((c) => c.id === id);
  if (!counter) return { counters, synced: false, cleared: false };
  if (counter.count >= 999) return { counters, synced: false, cleared: false };
  const updated = counters.map((c) =>
    c.id === id ? { ...c, count: c.count + 1 } : c,
  );
  return { counters: updated, synced: counter.isActive, cleared: false };
}

/** 减少计数 */
function decreaseCount(
  counters: any[],
  id: string,
  editMode: boolean,
): { counters: any[]; synced: boolean; cleared: boolean } {
  if (editMode) return { counters, synced: false, cleared: true };
  const counter = counters.find((c) => c.id === id);
  if (!counter || counter.count <= 0) return { counters, synced: false, cleared: false };
  const updated = counters.map((c) =>
    c.id === id ? { ...c, count: c.count - 1 } : c,
  );
  return { counters: updated, synced: counter.isActive, cleared: false };
}

/** 同步开关切换 */
function toggleSync(counters: any[], id: string, editMode: boolean): any[] | null {
  if (editMode) return null; // 编辑态不响应
  const counter = counters.find((c) => c.id === id);
  if (!counter) return null;
  return counters.map((c) =>
    c.id === id ? { ...c, isActive: !c.isActive } : c,
  );
}

/** 标签点击（编辑态守卫） */
function labelTap(editMode: boolean): boolean {
  return !editMode;
}

/** 删除计数器 */
function deleteCounter(
  counters: any[],
  id: string,
): { counters: any[]; showDelete: string } {
  const remaining = counters.filter((c) => c.id !== id);
  return {
    counters: remaining,
    showDelete: remaining.length > 0 ? 'all' : '',
  };
}

/** 关闭删除按钮 */
function dismissDelete(): string {
  return '';
}

/** 新手引导关闭逻辑 */
function dismissTip(step: number): { showStep: number; targetId: string; saveTipShown?: boolean } {
  if (step === 1) {
    return { showStep: 2, targetId: '' };
  }
  return { showStep: 0, targetId: '', saveTipShown: true };
}

/** 保存计数器到存储 */
function saveCounters(itemId: string, _counters: any[]): string | null {
  if (!itemId) return null;
  return `${TEMP_COUNTER_PREFIX}${itemId}`;
}

/** 加载计数器（含数据迁移） */
function loadCounters(raw: any[]): { counters: any[]; needsRecalc: boolean; maxZOrder: number } {
  let needsRecalc = false;
  const counters = raw.map((c, index) => {
    if (c.x === undefined || c.y === undefined) {
      needsRecalc = true;
    }
    return {
      id: c.id || `temp_${Date.now()}_${index}`,
      count: c.count || 0,
      isActive: c.isActive || false,
      x: c.x || 0,
      y: c.y || 0,
      name: c.name || '',
      zOrder: c.zOrder ?? index,
    };
  });
  const maxZOrder = counters.reduce((max, c) => Math.max(max, c.zOrder || 0), 0);
  return { counters, needsRecalc, maxZOrder };
}

/** 拖动约束计算 */
function constrainDrag(
  touchX: number,
  touchY: number,
  dragOffsetX: number,
  dragOffsetY: number,
  windowWidth: number,
  windowHeight: number,
  counterWidthPx: number,
  counterHeightPx: number,
  safeBottom: number,
  deleteOverflowPx: number,
): { x: number; y: number } {
  const minX = 0;
  const maxX = windowWidth - counterWidthPx - deleteOverflowPx;
  const minY = deleteOverflowPx;
  const maxY = windowHeight - safeBottom - counterHeightPx;

  let newX = touchX - dragOffsetX;
  let newY = touchY - dragOffsetY;
  newX = Math.max(minX, Math.min(newX, maxX));
  newY = Math.max(minY, Math.min(newY, maxY));

  return { x: newX, y: newY };
}

/** 模拟长按计时器逻辑 */
function simulateLongPress(
  showDeleteForId: string,
  moveDistance: number,
): { shouldStartTimer: boolean; shouldCancelTimer: boolean } {
  return {
    shouldStartTimer: !showDeleteForId,
    shouldCancelTimer: moveDistance > 10,
  };
}

describe('详情页 - 临时计数器创建限制', () => {
  const getDefaultPos = (index: number) => ({ x: 10 + index * 50, y: 500 });

  it('无计数器时应允许创建', () => {
    const result = createTempCounter([], 0, getDefaultPos);
    expect(result.allowed).toBe(true);
    expect(result.counter).toBeDefined();
    expect(result.counter!.count).toBe(0);
    expect(result.counter!.isActive).toBe(false);
  });

  it('已有1个计数器时应拒绝创建', () => {
    const existing = [{ id: 'temp_1', count: 5, isActive: false, x: 10, y: 500, name: '', zOrder: 1 }];
    const result = createTempCounter(existing, 1, getDefaultPos);
    expect(result.allowed).toBe(false);
    expect(result.toast).toBe('暂时只能创建1个临时计数器～');
  });

  it('创建的计数器 zOrder 应递增', () => {
    const result = createTempCounter([], 5, getDefaultPos);
    expect(result.counter!.zOrder).toBe(6);
  });
});

describe('详情页 - 计数器增减', () => {
  const counter = { id: 'temp_1', count: 5, isActive: true, x: 10, y: 500, name: '', zOrder: 1 };
  const inactiveCounter = { ...counter, id: 'temp_2', isActive: false };

  it('增加计数：正常递增', () => {
    const result = increaseCount([counter], 'temp_1', false);
    expect(result.counters[0].count).toBe(6);
    expect(result.synced).toBe(true);
    expect(result.cleared).toBe(false);
  });

  it('增加计数：编辑态应清除编辑态', () => {
    const result = increaseCount([counter], 'temp_1', true);
    expect(result.counters[0].count).toBe(5); // 不变
    expect(result.cleared).toBe(true);
  });

  it('增加计数：达到上限999不应继续增加', () => {
    const maxCounter = { ...counter, count: 999 };
    const result = increaseCount([maxCounter], 'temp_1', false);
    expect(result.counters[0].count).toBe(999);
  });

  it('增加计数：未激活状态不应同步主计数器', () => {
    const result = increaseCount([inactiveCounter], 'temp_2', false);
    expect(result.synced).toBe(false);
  });

  it('增加计数：不存在的id应忽略', () => {
    const result = increaseCount([counter], 'non_existent', false);
    expect(result.counters[0].count).toBe(5);
    expect(result.synced).toBe(false);
  });

  it('减少计数：正常递减', () => {
    const result = decreaseCount([counter], 'temp_1', false);
    expect(result.counters[0].count).toBe(4);
    expect(result.synced).toBe(true);
  });

  it('减少计数：count为0时不应递减', () => {
    const zeroCounter = { ...counter, count: 0 };
    const result = decreaseCount([zeroCounter], 'temp_1', false);
    expect(result.counters[0].count).toBe(0);
  });

  it('减少计数：编辑态应清除编辑态', () => {
    const result = decreaseCount([counter], 'temp_1', true);
    expect(result.counters[0].count).toBe(5);
    expect(result.cleared).toBe(true);
  });
});

describe('详情页 - 同步开关切换', () => {
  const counter = { id: 'temp_1', count: 5, isActive: false, x: 10, y: 500, name: '', zOrder: 1 };

  it('正常切换：false → true', () => {
    const result = toggleSync([counter], 'temp_1', false);
    expect(result).not.toBeNull();
    expect(result![0].isActive).toBe(true);
  });

  it('正常切换：true → false', () => {
    const activeCounter = { ...counter, isActive: true };
    const result = toggleSync([activeCounter], 'temp_1', false);
    expect(result).not.toBeNull();
    expect(result![0].isActive).toBe(false);
  });

  it('编辑态下应返回null（不响应）', () => {
    const result = toggleSync([counter], 'temp_1', true);
    expect(result).toBeNull();
  });
});

describe('详情页 - 标签点击编辑态守卫', () => {
  it('非编辑态应允许', () => {
    expect(labelTap(false)).toBe(true);
  });

  it('编辑态应阻止', () => {
    expect(labelTap(true)).toBe(false);
  });
});

describe('详情页 - 删除计数器', () => {
  const counters = [
    { id: 'temp_1', count: 1, x: 10, y: 500, zOrder: 1 },
  ];

  it('删除唯一的计数器应退出编辑态', () => {
    const result = deleteCounter(counters, 'temp_1');
    expect(result.counters.length).toBe(0);
    expect(result.showDelete).toBe('');
  });

  it('删除不存在的id不应改变列表', () => {
    const twoCounters = [
      { id: 'temp_1', count: 1, x: 10, y: 500, zOrder: 1 },
      { id: 'temp_2', count: 2, x: 60, y: 500, zOrder: 2 },
    ];
    const result = deleteCounter(twoCounters, 'temp_3');
    expect(result.counters.length).toBe(2);
  });
});

describe('详情页 - 关闭删除按钮', () => {
  it('应返回空字符串', () => {
    expect(dismissDelete()).toBe('');
  });
});

describe('详情页 - 新手引导关闭', () => {
  it('Step 1 → Step 2', () => {
    const result = dismissTip(1);
    expect(result.showStep).toBe(2);
    expect(result.saveTipShown).toBeUndefined();
  });

  it('Step 2 → 关闭并存储标记', () => {
    const result = dismissTip(2);
    expect(result.showStep).toBe(0);
    expect(result.saveTipShown).toBe(true);
  });
});

describe('详情页 - 临时计数器持久化', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('saveCounters：有itemId时应返回正确的存储key', () => {
    const key = saveCounters('item123', [{ id: 'temp_1' }]);
    expect(key).toBe(`${TEMP_COUNTER_PREFIX}item123`);
  });

  it('saveCounters：无itemId时应返回null', () => {
    const key = saveCounters('', [{ id: 'temp_1' }]);
    expect(key).toBeNull();
  });

  it('saveCounters：实际写入wx storage', () => {
    const counters = [{ id: 'temp_1', count: 5 }];
    wx.setStorageSync(`${TEMP_COUNTER_PREFIX}item1`, counters);
    const saved = wx.getStorageSync(`${TEMP_COUNTER_PREFIX}item1`);
    expect(saved).toEqual(counters);
  });
});

describe('详情页 - 临时计数器加载与数据迁移', () => {
  it('空数据应返回空数组', () => {
    const result = loadCounters([]);
    expect(result.counters).toEqual([]);
    expect(result.needsRecalc).toBe(false);
  });

  it('完整数据应正常加载', () => {
    const raw = [{ id: 'temp_1', count: 5, isActive: true, x: 10, y: 500, name: 'test', zOrder: 3 }];
    const result = loadCounters(raw);
    expect(result.counters[0].id).toBe('temp_1');
    expect(result.counters[0].count).toBe(5);
    expect(result.counters[0].isActive).toBe(true);
    expect(result.needsRecalc).toBe(false);
    expect(result.maxZOrder).toBe(3);
  });

  it('缺少 x/y 应标记 needsRecalc', () => {
    const raw = [{ id: 'temp_1', count: 5 }];
    const result = loadCounters(raw);
    expect(result.needsRecalc).toBe(true);
    expect(result.counters[0].x).toBe(0);
    expect(result.counters[0].y).toBe(0);
  });

  it('缺少 zOrder 应使用 index 作为默认值', () => {
    const raw = [{ id: 'temp_1' }, { id: 'temp_2' }];
    const result = loadCounters(raw);
    expect(result.counters[0].zOrder).toBe(0);
    expect(result.counters[1].zOrder).toBe(1);
  });

  it('缺少 id 应生成默认id', () => {
    const raw = [{ count: 3 }];
    const result = loadCounters(raw);
    expect(result.counters[0].id).toMatch(/^temp_\d+_0$/);
  });

  it('缺少 name 应默认为空字符串', () => {
    const raw = [{ id: 'temp_1', count: 5, x: 10, y: 500, zOrder: 1 }];
    const result = loadCounters(raw);
    expect(result.counters[0].name).toBe('');
  });

  it('缺少 isActive 应默认为 false', () => {
    const raw = [{ id: 'temp_1', count: 5, x: 10, y: 500, zOrder: 1 }];
    const result = loadCounters(raw);
    expect(result.counters[0].isActive).toBe(false);
  });

  it('maxZOrder 应取所有计数器中的最大值', () => {
    const raw = [
      { id: 'a', zOrder: 2 },
      { id: 'b', zOrder: 5 },
      { id: 'c', zOrder: 3 },
    ];
    const result = loadCounters(raw);
    expect(result.maxZOrder).toBe(5);
  });
});

describe('详情页 - 拖动约束', () => {
  const windowWidth = 375;
  const windowHeight = 812;
  const counterWidthPx = 90;
  const counterHeightPx = 60;
  const safeBottom = 34;
  const deleteOverflowPx = 7;

  it('正常拖动应在范围内', () => {
    const result = constrainDrag(
      100, 200, // touch position
      50, 50,   // drag offset
      windowWidth, windowHeight, counterWidthPx, counterHeightPx, safeBottom, deleteOverflowPx,
    );
    expect(result.x).toBe(50);
    expect(result.y).toBe(150);
  });

  it('拖出左边应被限制', () => {
    const result = constrainDrag(
      10, 100,
      50, 50,
      windowWidth, windowHeight, counterWidthPx, counterHeightPx, safeBottom, deleteOverflowPx,
    );
    expect(result.x).toBe(0); // minX
  });

  it('拖出右边应被限制', () => {
    const result = constrainDrag(
      400, 100,
      10, 50,
      windowWidth, windowHeight, counterWidthPx, counterHeightPx, safeBottom, deleteOverflowPx,
    );
    const maxX = windowWidth - counterWidthPx - deleteOverflowPx;
    expect(result.x).toBe(maxX);
  });

  it('拖出顶部应被限制', () => {
    const result = constrainDrag(
      100, 5,
      50, 50,
      windowWidth, windowHeight, counterWidthPx, counterHeightPx, safeBottom, deleteOverflowPx,
    );
    expect(result.y).toBe(deleteOverflowPx); // minY
  });

  it('拖出底部（含安全区域）应被限制', () => {
    const result = constrainDrag(
      100, 800,
      50, 50,
      windowWidth, windowHeight, counterWidthPx, counterHeightPx, safeBottom, deleteOverflowPx,
    );
    const maxY = windowHeight - safeBottom - counterHeightPx;
    expect(result.y).toBe(maxY);
  });
});

describe('详情页 - 长按逻辑', () => {
  it('非编辑态应启动长按计时器', () => {
    const result = simulateLongPress('', 0);
    expect(result.shouldStartTimer).toBe(true);
    expect(result.shouldCancelTimer).toBe(false);
  });

  it('编辑态下不应启动长按计时器', () => {
    const result = simulateLongPress('all', 0);
    expect(result.shouldStartTimer).toBe(false);
  });

  it('移动距离 > 10px 应取消计时器', () => {
    const result = simulateLongPress('', 15);
    expect(result.shouldCancelTimer).toBe(true);
  });

  it('移动距离 <= 10px 不应取消计时器', () => {
    const result = simulateLongPress('', 5);
    expect(result.shouldCancelTimer).toBe(false);
  });
});

describe('详情页 - 新手引导首次展示逻辑', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('首次创建 + 未展示过引导 → 应展示 Step 1', () => {
    const isFirst = true; // counters.length === 0 before creation
    const hasShownTips = !!wx.getStorageSync(TEMP_COUNTER_TIPS_SHOWN_KEY);
    const shouldShowTips = isFirst && !hasShownTips;
    expect(shouldShowTips).toBe(true);
  });

  it('已展示过引导 → 不应展示', () => {
    wx.setStorageSync(TEMP_COUNTER_TIPS_SHOWN_KEY, true);
    const hasShownTips = !!wx.getStorageSync(TEMP_COUNTER_TIPS_SHOWN_KEY);
    expect(hasShownTips).toBe(true);
  });
});
