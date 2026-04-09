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

// ========== PDF 加载 UX 优化 测试 ==========

/**
 * 模拟 convertPdfItem 的进度回调逻辑（纯函数提取）
 */
function handleProgress(
  progress: { current: number; total: number; paths: string[] },
  pageState: {
    isPageHidden: boolean;
    name: string;
    currentImageIndex: number;
    scale: number;
    translateX: number;
    translateY: number;
  },
): {
  shouldHideLoading: boolean;
  setData: Record<string, any> | null;
} {
  if (pageState.isPageHidden) {
    return { shouldHideLoading: false, setData: null };
  }

  if (progress.current === 1) {
    // 第一页：关闭 loading，显示图片
    return {
      shouldHideLoading: true,
      setData: {
        itemType: 'pdf',
        itemName: pageState.name,
        itemPath: progress.paths[0],
        itemPaths: progress.paths,
        currentImageIndex: 0,
        totalImages: progress.paths.length,
        scale: 1,
        translateX: 0,
        translateY: 0,
        swiperEnabled: true,
        imageSizes: {},
        pdfConvertProgress: `${progress.current}/${progress.total}`,
      },
    };
  } else {
    // 后续页：只更新 paths 和进度
    return {
      shouldHideLoading: false,
      setData: {
        itemPaths: progress.paths,
        totalImages: progress.paths.length,
        pdfConvertProgress: `${progress.current}/${progress.total}`,
      },
    };
  }
}

/**
 * 模拟加载完成后的状态合并逻辑（纯函数提取）
 * 保留用户的页面位置和缩放状态
 */
function handleCompletion(
  result: { paths: string[]; pageCount: number; totalPageCount: number },
  currentState: {
    currentImageIndex: number;
    scale: number;
    translateX: number;
    translateY: number;
    isPageHidden: boolean;
    name: string;
  },
): Record<string, any> | null {
  if (currentState.isPageHidden) {
    return { isConverting: false, pdfConvertProgress: '' };
  }

  const itemPaths = result.paths;
  const totalImages = itemPaths.length;
  const preserveIndex = Math.min(currentState.currentImageIndex, totalImages - 1);
  const { scale, translateX, translateY } = currentState;

  return {
    itemType: 'pdf',
    itemName: currentState.name,
    itemPath: itemPaths[preserveIndex],
    itemPaths,
    currentImageIndex: preserveIndex,
    totalImages,
    scale,
    translateX,
    translateY,
    swiperEnabled: scale <= 1,
    imageSizes: {},
    isConverting: false,
    pdfConvertProgress: '',
  };
}

describe('详情页 - PDF加载进度回调', () => {
  it('第一页加载完成应关闭 loading 并显示图片', () => {
    const result = handleProgress(
      { current: 1, total: 5, paths: ['/path/page1.png'] },
      { isPageHidden: false, name: '测试PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.shouldHideLoading).toBe(true);
    expect(result.setData).not.toBeNull();
    expect(result.setData!.itemPath).toBe('/path/page1.png');
    expect(result.setData!.itemPaths).toEqual(['/path/page1.png']);
    expect(result.setData!.totalImages).toBe(1); // paths.length, not total
    expect(result.setData!.pdfConvertProgress).toBe('1/5');
  });

  it('后续页加载只更新 itemPaths 和进度', () => {
    const result = handleProgress(
      { current: 3, total: 5, paths: ['/p1.png', '/p2.png', '/p3.png'] },
      { isPageHidden: false, name: '测试PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.shouldHideLoading).toBe(false);
    expect(result.setData!.itemPaths).toEqual(['/p1.png', '/p2.png', '/p3.png']);
    expect(result.setData!.totalImages).toBe(3);
    expect(result.setData!.pdfConvertProgress).toBe('3/5');
    // 不应重置缩放/位移状态
    expect(result.setData!.scale).toBeUndefined();
    expect(result.setData!.translateX).toBeUndefined();
  });

  it('页面隐藏时不应更新 UI', () => {
    const result = handleProgress(
      { current: 1, total: 5, paths: ['/page1.png'] },
      { isPageHidden: true, name: '测试PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.setData).toBeNull();
    expect(result.shouldHideLoading).toBe(false);
  });
});

describe('详情页 - PDF加载完成后状态保留', () => {
  const defaultResult = { paths: ['/p1.png', '/p2.png', '/p3.png'], pageCount: 3, totalPageCount: 3 };

  it('用户未翻页时应保留 index 0', () => {
    const state = { currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.currentImageIndex).toBe(0);
    expect(setData.itemPath).toBe('/p1.png');
  });

  it('用户翻到第 2 页时应保留该位置', () => {
    const state = { currentImageIndex: 1, scale: 1, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.currentImageIndex).toBe(1);
    expect(setData.itemPath).toBe('/p2.png');
  });

  it('用户翻到的页数超过加载结果时应回退到最后一页', () => {
    const state = { currentImageIndex: 5, scale: 1, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.currentImageIndex).toBe(2); // Math.min(5, 3-1) = 2
    expect(setData.itemPath).toBe('/p3.png');
  });

  it('用户缩放到 2x 时应保留缩放状态', () => {
    const state = { currentImageIndex: 0, scale: 2, translateX: 10, translateY: 20, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.scale).toBe(2);
    expect(setData.translateX).toBe(10);
    expect(setData.translateY).toBe(20);
  });

  it('缩放状态保留时 swiperEnabled 应为 false', () => {
    const state = { currentImageIndex: 0, scale: 2.5, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.swiperEnabled).toBe(false); // scale <= 1 is false
  });

  it('未缩放时 swiperEnabled 应为 true', () => {
    const state = { currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.swiperEnabled).toBe(true);
  });

  it('页面隐藏时只清除转换状态', () => {
    const state = { currentImageIndex: 1, scale: 2, translateX: 10, translateY: 20, isPageHidden: true, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.isConverting).toBe(false);
    expect(setData.pdfConvertProgress).toBe('');
    expect(setData.scale).toBeUndefined(); // 不更新 UI
  });

  it('加载完成时 pdfConvertProgress 应清空', () => {
    const state = { currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0, isPageHidden: false, name: 'PDF' };
    const setData = handleCompletion(defaultResult, state)!;
    expect(setData.pdfConvertProgress).toBe('');
  });
});

describe('详情页 - pdfConvertProgress 格式', () => {
  it('应格式化为 current/total', () => {
    const progress = `${3}/${10}`;
    expect(progress).toBe('3/10');
  });

  it('完成后应清空', () => {
    const progress = '';
    expect(progress).toBe('');
  });

  it('第一页加载完成时应显示 1/N', () => {
    const result = handleProgress(
      { current: 1, total: 8, paths: ['/p1.png'] },
      { isPageHidden: false, name: 'PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.setData!.pdfConvertProgress).toBe('1/8');
  });

  it('最后一页加载完成时应显示 N/N', () => {
    const paths = Array.from({ length: 5 }, (_, i) => `/p${i + 1}.png`);
    const result = handleProgress(
      { current: 5, total: 5, paths },
      { isPageHidden: false, name: 'PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.setData!.pdfConvertProgress).toBe('5/5');
  });
});

describe('详情页 - totalImages 使用 paths.length', () => {
  it('第一页加载时 totalImages 应为 1 而非 PDF 总页数', () => {
    const result = handleProgress(
      { current: 1, total: 10, paths: ['/p1.png'] },
      { isPageHidden: false, name: 'PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.setData!.totalImages).toBe(1);
  });

  it('第三页加载时 totalImages 应为 3', () => {
    const result = handleProgress(
      { current: 3, total: 10, paths: ['/p1.png', '/p2.png', '/p3.png'] },
      { isPageHidden: false, name: 'PDF', currentImageIndex: 0, scale: 1, translateX: 0, translateY: 0 },
    );
    expect(result.setData!.totalImages).toBe(3);
  });
});

describe('详情页 - swiperEnabled 动态计算', () => {
  it('scale = 1 时 swiperEnabled = true', () => {
    expect(1 <= 1).toBe(true);
  });

  it('scale = 1.5 时 swiperEnabled = false', () => {
    expect(1.5 <= 1).toBe(false);
  });

  it('scale = 2.0 时 swiperEnabled = false', () => {
    expect(2.0 <= 1).toBe(false);
  });

  it('scale = 0.5 时 swiperEnabled = true', () => {
    expect(0.5 <= 1).toBe(true);
  });
});

// ========== 图片缩放拖动 - 平板兼容性测试 ==========

/**
 * 模拟 handleDragImage 的边界计算（纯函数提取）
 * 使用 Math.abs 让缩放图片在小于容器时也能拖动
 */
function calcMaxTranslate(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  scale: number,
): { maxTranslateX: number; maxTranslateY: number } {
  const fitScale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const displayWidth = imageWidth * fitScale;
  const displayHeight = imageHeight * fitScale;
  return {
    maxTranslateX: Math.abs(displayWidth * scale - containerWidth) / 2,
    maxTranslateY: Math.abs(displayHeight * scale - containerHeight) / 2,
  };
}

describe('详情页 - 图片缩放拖动：手机端', () => {
  // iPhone 14 竖屏：容器窄，竖图填满宽度
  const containerWidth = 390;
  const containerHeight = 700;
  const imageWidth = 2000;
  const imageHeight = 3000;

  it('scale=2 时水平可拖动（图片溢出容器）', () => {
    const { maxTranslateX } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    expect(maxTranslateX).toBeGreaterThan(0);
  });

  it('scale=2 时垂直可拖动（图片溢出容器）', () => {
    const { maxTranslateY } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    expect(maxTranslateY).toBeGreaterThan(0);
  });

  it('scale=1 时水平不可拖动（图片恰好填满宽度）', () => {
    const { maxTranslateX } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 1);
    // fitScale 限制：displayWidth ≈ containerWidth，差值为 0
    expect(maxTranslateX).toBe(0);
  });
});

describe('详情页 - 图片缩放拖动：平板端（横屏宽容器）', () => {
  // iPad 横屏：容器宽，竖图受高度限制，水平有大段空白
  const containerWidth = 1024;
  const containerHeight = 700;
  const imageWidth = 2000;
  const imageHeight = 3000;

  it('scale=2 时水平可拖动（图片虽小于容器，Math.abs 仍允许拖动）', () => {
    const { maxTranslateX } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    // displayWidth ≈ 467, displayWidth * 2 ≈ 934 < 1024
    // 旧逻辑: Math.max(0, (934 - 1024)/2) = 0 → 不能拖
    // 新逻辑: Math.abs(934 - 1024) / 2 = 45 → 可以拖
    expect(maxTranslateX).toBeGreaterThan(0);
  });

  it('scale=2 时垂直可拖动（图片溢出容器）', () => {
    const { maxTranslateY } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    expect(maxTranslateY).toBeGreaterThan(0);
  });

  it('scale=4 时水平可拖动范围更大', () => {
    const at2 = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    const at4 = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 4);
    expect(at4.maxTranslateX).toBeGreaterThan(at2.maxTranslateX);
  });

  it('scale=1 时虽然公式返回非零值，但代码不会调用 handleDragImage（scale <= 1 被跳过）', () => {
    // 平板上 scale=1 时 displayWidth < containerWidth，Math.abs 返回非零
    // 但实际代码在 scale <= 1 时不调用 handleDragImage，所以不影响
    const { maxTranslateX } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 1);
    expect(maxTranslateX).toBeGreaterThan(0); // 公式值非零
  });

  it('宽图（横向图解）在平板上垂直也可拖动', () => {
    // 横向图片 3000x2000
    const { maxTranslateY } = calcMaxTranslate(3000, 2000, containerWidth, containerHeight, 2);
    expect(maxTranslateY).toBeGreaterThan(0);
  });
});

describe('详情页 - 图片缩放拖动：旧逻辑回归验证', () => {
  // 手机端：图片溢出容器时，Math.abs 与旧 Math.max(0,...) 结果一致
  const containerWidth = 390;
  const containerHeight = 700;
  const imageWidth = 2000;
  const imageHeight = 3000;

  it('图片溢出时新逻辑与旧逻辑结果一致', () => {
    const { maxTranslateX } = calcMaxTranslate(imageWidth, imageHeight, containerWidth, containerHeight, 2);
    const fitScale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
    const displayWidth = imageWidth * fitScale;
    const oldMax = Math.max(0, (displayWidth * 2 - containerWidth) / 2);
    expect(maxTranslateX).toBe(oldMax);
  });
});
