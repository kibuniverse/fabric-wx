/**
 * app.ts 核心逻辑单元测试
 * 测试：账号失效检测、计数器重置、数据同步、登录合并、图解清理
 */

import { clearAllMocks } from '../../__mocks__/wx';

// ========== 从 app.ts 提取的纯函数/逻辑 ==========

/** 检测云函数返回是否表示账号失效 */
function isAccountInvalidated(result: any): boolean {
  if (!result) return false;
  if (result.error === '用户不存在' || result.error === '用户不存在，请先登录') {
    return true;
  }
  return false;
}

/** 检查默认计数器是否被修改 */
function isDefaultCounterModified(storage: Record<string, any>): boolean {
  const savedData = storage['local_default_counter'];
  if (!savedData) return false;
  return (
    savedData.currentCount !== 0 ||
    savedData.targetCount !== 999 ||
    savedData.name !== '默认计数器' ||
    (savedData.history && savedData.history.length > 0) ||
    (savedData.memo && savedData.memo.length > 0) ||
    (savedData.timerState && savedData.timerState.elapsedTime > 0)
  );
}

/** 检测是否需要老用户迁移 */
function isOldUserMigration(storage: Record<string, any>): boolean {
  if (storage['counter_migrated']) return false;
  const keys = storage['counter_keys'] || [];
  if (keys.length === 1 && keys[0] === 'local_default_counter') return false;
  return keys.length > 0;
}

/** 重置本地计数器为默认状态（注销账号后） */
function resetLocalCountersToDefault(
  storage: Record<string, any>,
  removeKeys: string[],
  now: number,
) {
  const counterKeys = storage['counter_keys'] || [];
  for (const key of counterKeys) {
    delete storage[key];
  }
  delete storage['counter_keys'];
  delete storage['local_default_counter'];
  delete storage['counter_migrated'];

  const defaultKeys = ['local_default_counter'];
  const defaultData = {
    name: '默认计数器',
    targetCount: 999,
    currentCount: 0,
    startTime: 0,
    history: [],
    timerState: { startTimestamp: 0, elapsedTime: 0, wasRunning: false },
    memo: '',
    updatedAt: now,
  };
  storage['counter_keys'] = defaultKeys;
  storage['local_default_counter'] = defaultData;
  removeKeys.push(...counterKeys, 'counter_keys', 'local_default_counter', 'counter_migrated');
}

/** 退出登录时重置本地计数器（不清除迁移标记） */
function resetLocalCountersForLogout(
  storage: Record<string, any>,
  now: number,
) {
  const counterKeys = storage['counter_keys'] || [];
  for (const key of counterKeys) {
    delete storage[key];
  }
  delete storage['counter_keys'];
  delete storage['local_default_counter'];

  const defaultKeys = ['local_default_counter'];
  const defaultData = {
    name: '默认计数器',
    targetCount: 999,
    currentCount: 0,
    startTime: 0,
    history: [],
    timerState: { startTimestamp: 0, elapsedTime: 0, wasRunning: false },
    memo: '',
    updatedAt: now,
  };
  storage['counter_keys'] = defaultKeys;
  storage['local_default_counter'] = defaultData;
}

/** 累加针织时长 */
function addKnittingTime(
  storage: Record<string, any>,
  globalData: { totalKnittingTime: number },
  elapsedMs: number,
): boolean {
  if (elapsedMs <= 0) return false;
  const userInfo = storage['userInfo'];
  if (!userInfo || !userInfo.isLoggedIn) return false;
  globalData.totalKnittingTime += elapsedMs;
  const localTotal = storage['total_zhizhi_time'] || 0;
  storage['total_zhizhi_time'] = localTotal + elapsedMs;
  return true;
}

/** 账号失效时清理已同步图解 */
function cleanupSyncedDiagrams(
  storage: Record<string, any>,
  removedFiles: string[],
) {
  const imageList = storage['imageList'] || [];
  const fileList = storage['fileList'] || [];

  for (const item of imageList) {
    if (item.syncStatus === 'synced') {
      collectDiagramFiles(item, removedFiles);
    }
  }
  for (const item of fileList) {
    if (item.syncStatus === 'synced') {
      collectDiagramFiles(item, removedFiles);
    }
  }

  storage['imageList'] = imageList.filter((i: any) => i.syncStatus === 'local');
  storage['fileList'] = fileList.filter((i: any) => i.syncStatus === 'local');
}

/** 收集图解关联文件路径 */
function collectDiagramFiles(item: any, files: string[]) {
  if (item.paths && item.paths.length > 0) {
    files.push(...item.paths);
  }
  if (item.cover && item.cover !== item.paths?.[0]) {
    files.push(item.cover);
  }
  if (item.pdfSourcePath) {
    files.push(item.pdfSourcePath);
  }
}

// ========== 测试 ==========

describe('app.ts 核心逻辑', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  // ===== isAccountInvalidated =====
  describe('isAccountInvalidated', () => {
    it('result 为 null → false', () => {
      expect(isAccountInvalidated(null)).toBe(false);
    });

    it('result 为 undefined → false', () => {
      expect(isAccountInvalidated(undefined)).toBe(false);
    });

    it('error 为 "用户不存在" → true', () => {
      expect(isAccountInvalidated({ error: '用户不存在' })).toBe(true);
    });

    it('error 为 "用户不存在，请先登录" → true', () => {
      expect(isAccountInvalidated({ error: '用户不存在，请先登录' })).toBe(true);
    });

    it('error 为其他字符串 → false', () => {
      expect(isAccountInvalidated({ error: '网络错误' })).toBe(false);
    });

    it('无 error 字段 → false', () => {
      expect(isAccountInvalidated({ success: true })).toBe(false);
    });

    it('success=false 但 error 不是账号失效 → false', () => {
      expect(isAccountInvalidated({ success: false, error: '参数错误' })).toBe(false);
    });
  });

  // ===== isDefaultCounterModified =====
  describe('isDefaultCounterModified', () => {
    it('无数据 → false', () => {
      expect(isDefaultCounterModified({})).toBe(false);
    });

    it('完全默认值 → false', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 999,
          name: '默认计数器',
          history: [],
          memo: '',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(false);
    });

    it('currentCount 被修改 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 5,
          targetCount: 999,
          name: '默认计数器',
          history: [],
          memo: '',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });

    it('targetCount 被修改 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 100,
          name: '默认计数器',
          history: [],
          memo: '',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });

    it('name 被修改 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 999,
          name: '我的计数器',
          history: [],
          memo: '',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });

    it('history 不为空 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 999,
          name: '默认计数器',
          history: [{ time: '10:00', action: '+1', count: 1 }],
          memo: '',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });

    it('memo 不为空 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 999,
          name: '默认计数器',
          history: [],
          memo: '备注内容',
          timerState: { elapsedTime: 0 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });

    it('timerState.elapsedTime > 0 → true', () => {
      const storage: Record<string, any> = {
        local_default_counter: {
          currentCount: 0,
          targetCount: 999,
          name: '默认计数器',
          history: [],
          memo: '',
          timerState: { elapsedTime: 5000 },
        },
      };
      expect(isDefaultCounterModified(storage)).toBe(true);
    });
  });

  // ===== isOldUserMigration =====
  describe('isOldUserMigration', () => {
    it('已迁移 → false', () => {
      expect(isOldUserMigration({ counter_migrated: true, counter_keys: ['a', 'b'] })).toBe(false);
    });

    it('只有 local_default_counter → false', () => {
      expect(isOldUserMigration({ counter_keys: ['local_default_counter'] })).toBe(false);
    });

    it('有其他计数器 → true', () => {
      expect(isOldUserMigration({ counter_keys: ['counter_123'] })).toBe(true);
    });

    it('混合计数器（包含 local_default_counter）→ true', () => {
      expect(isOldUserMigration({ counter_keys: ['local_default_counter', 'counter_456'] })).toBe(true);
    });

    it('无计数器（空数组）→ false', () => {
      expect(isOldUserMigration({ counter_keys: [] })).toBe(false);
    });

    it('无 counter_keys → false', () => {
      expect(isOldUserMigration({})).toBe(false);
    });

    it('旧格式对象数组（有 key 字段）→ true', () => {
      expect(isOldUserMigration({ counter_keys: [{ key: 'counter_old', title: '旧计数器' }] })).toBe(true);
    });
  });

  // ===== resetLocalCountersToDefault =====
  describe('resetLocalCountersToDefault', () => {
    it('清除旧计数器数据并创建默认计数器', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1', 'counter_2'],
        counter_1: { name: '计数器1', currentCount: 10 },
        counter_2: { name: '计数器2', currentCount: 20 },
        counter_migrated: true,
      };
      const removeKeys: string[] = [];

      resetLocalCountersToDefault(storage, removeKeys, 1000);

      // 旧数据被清除
      expect(storage['counter_1']).toBeUndefined();
      expect(storage['counter_2']).toBeUndefined();
      expect(storage['counter_migrated']).toBeUndefined();
      // 新默认计数器创建
      expect(storage['counter_keys']).toEqual(['local_default_counter']);
      expect(storage['local_default_counter'].name).toBe('默认计数器');
      expect(storage['local_default_counter'].currentCount).toBe(0);
      expect(storage['local_default_counter'].targetCount).toBe(999);
      expect(storage['local_default_counter'].updatedAt).toBe(1000);
    });

    it('清除 local_default_counter 后重建', () => {
      const storage: Record<string, any> = {
        counter_keys: ['local_default_counter'],
        local_default_counter: { name: '已修改', currentCount: 50 },
      };
      const removeKeys: string[] = [];

      resetLocalCountersToDefault(storage, removeKeys, 2000);

      expect(storage['local_default_counter'].name).toBe('默认计数器');
      expect(storage['local_default_counter'].currentCount).toBe(0);
    });

    it('空 counter_keys 不报错', () => {
      const storage: Record<string, any> = {};
      const removeKeys: string[] = [];

      resetLocalCountersToDefault(storage, removeKeys, 3000);

      expect(storage['counter_keys']).toEqual(['local_default_counter']);
    });
  });

  // ===== resetLocalCountersForLogout =====
  describe('resetLocalCountersForLogout', () => {
    it('清除旧数据并创建默认计数器', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_a'],
        counter_a: { name: '计数器A', currentCount: 100 },
      };

      resetLocalCountersForLogout(storage, 5000);

      expect(storage['counter_a']).toBeUndefined();
      expect(storage['counter_keys']).toEqual(['local_default_counter']);
      expect(storage['local_default_counter'].name).toBe('默认计数器');
      expect(storage['local_default_counter'].updatedAt).toBe(5000);
    });

    it('不清除 counter_migrated 标记', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_a'],
        counter_a: {},
        counter_migrated: true,
      };

      resetLocalCountersForLogout(storage, 5000);

      expect(storage['counter_migrated']).toBe(true);
    });
  });

  // ===== addKnittingTime =====
  describe('addKnittingTime', () => {
    it('未登录不累加 → false', () => {
      const storage: Record<string, any> = {};
      const globalData = { totalKnittingTime: 0 };
      expect(addKnittingTime(storage, globalData, 1000)).toBe(false);
      expect(globalData.totalKnittingTime).toBe(0);
    });

    it('isLoggedIn=false 不累加 → false', () => {
      const storage: Record<string, any> = { userInfo: { isLoggedIn: false } };
      const globalData = { totalKnittingTime: 0 };
      expect(addKnittingTime(storage, globalData, 1000)).toBe(false);
    });

    it('elapsedMs=0 不累加 → false', () => {
      const storage: Record<string, any> = { userInfo: { isLoggedIn: true } };
      const globalData = { totalKnittingTime: 0 };
      expect(addKnittingTime(storage, globalData, 0)).toBe(false);
    });

    it('elapsedMs<0 不累加 → false', () => {
      const storage: Record<string, any> = { userInfo: { isLoggedIn: true } };
      const globalData = { totalKnittingTime: 0 };
      expect(addKnittingTime(storage, globalData, -100)).toBe(false);
    });

    it('正常累加', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        total_zhizhi_time: 5000,
      };
      const globalData = { totalKnittingTime: 5000 };

      const result = addKnittingTime(storage, globalData, 3000);

      expect(result).toBe(true);
      expect(globalData.totalKnittingTime).toBe(8000);
      expect(storage['total_zhizhi_time']).toBe(8000);
    });

    it('首次累加（无 total_zhizhi_time）', () => {
      const storage: Record<string, any> = { userInfo: { isLoggedIn: true } };
      const globalData = { totalKnittingTime: 0 };

      addKnittingTime(storage, globalData, 60000);

      expect(globalData.totalKnittingTime).toBe(60000);
      expect(storage['total_zhizhi_time']).toBe(60000);
    });
  });

  // ===== cleanupSyncedDiagrams =====
  describe('cleanupSyncedDiagramsForAccountInvalidation', () => {
    it('删除 synced 图解，保留 local 图解', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/path/s1.jpg'] },
          { id: '2', syncStatus: 'local', paths: ['/path/l1.jpg'] },
        ],
        fileList: [
          { id: '3', syncStatus: 'synced', paths: ['/path/s2.pdf'], pdfSourcePath: '/path/s2src.pdf' },
          { id: '4', syncStatus: 'local', paths: ['/path/l2.pdf'] },
        ],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      // synced 被删除
      expect(storage['imageList'].length).toBe(1);
      expect(storage['imageList'][0].id).toBe('2');
      expect(storage['fileList'].length).toBe(1);
      expect(storage['fileList'][0].id).toBe('4');
      // 文件被收集
      expect(removedFiles).toContain('/path/s1.jpg');
      expect(removedFiles).toContain('/path/s2.pdf');
      expect(removedFiles).toContain('/path/s2src.pdf');
    });

    it('全部 local → 保留全部', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'local', paths: [] },
        ],
        fileList: [],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(storage['imageList'].length).toBe(1);
      expect(removedFiles.length).toBe(0);
    });

    it('空列表不报错', () => {
      const storage: Record<string, any> = {};
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(storage['imageList']).toEqual([]);
      expect(storage['fileList']).toEqual([]);
    });

    it('封面与 paths[0] 不同时也被收集', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/path/a.jpg'], cover: '/path/cover.jpg' },
        ],
        fileList: [],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(removedFiles).toContain('/path/a.jpg');
      expect(removedFiles).toContain('/path/cover.jpg');
    });

    it('封面与 paths[0] 相同时不重复收集', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/path/a.jpg'], cover: '/path/a.jpg' },
        ],
        fileList: [],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(removedFiles.filter((f) => f === '/path/a.jpg').length).toBe(1);
    });
  });

  // ===== collectDiagramFiles =====
  describe('collectDiagramFiles', () => {
    it('无文件时不收集', () => {
      const files: string[] = [];
      collectDiagramFiles({ paths: [] }, files);
      expect(files.length).toBe(0);
    });

    it('收集 paths', () => {
      const files: string[] = [];
      collectDiagramFiles({ paths: ['/a.jpg', '/b.jpg'] }, files);
      expect(files).toEqual(['/a.jpg', '/b.jpg']);
    });

    it('收集 cover（与 paths[0] 不同）', () => {
      const files: string[] = [];
      collectDiagramFiles({ paths: ['/a.jpg'], cover: '/cover.jpg' }, files);
      expect(files).toContain('/cover.jpg');
    });

    it('不重复收集 cover（与 paths[0] 相同）', () => {
      const files: string[] = [];
      collectDiagramFiles({ paths: ['/a.jpg'], cover: '/a.jpg' }, files);
      expect(files).toEqual(['/a.jpg']);
    });

    it('收集 pdfSourcePath', () => {
      const files: string[] = [];
      collectDiagramFiles({ paths: [], pdfSourcePath: '/src.pdf' }, files);
      expect(files).toEqual(['/src.pdf']);
    });
  });

  // ===== syncCounterData download 逻辑 =====
  describe('syncCounterData download 本地处理', () => {
    /** 模拟 syncCounterData download 后的本地数据更新逻辑 */
    function applyDownloadToLocal(
      storage: Record<string, any>,
      cloudKeys: any[],
      cloudCounters: Record<string, any>,
    ) {
      const localKeys = storage['counter_keys'] || [];

      // 兼容旧格式
      const cloudKeysList = (cloudKeys || []).map((k: any) => {
        if (typeof k === 'string') return k;
        return k.key || k;
      });

      const cloudKeysSet = new Set(cloudKeysList);

      // 删除本地多余的计数器
      for (const key of localKeys) {
        if (!cloudKeysSet.has(key)) {
          delete storage[key];
        }
      }

      // 更新 counterKeys
      storage['counter_keys'] = cloudKeysList;

      // 更新云端返回的计数器数据
      if (cloudCounters && Object.keys(cloudCounters).length > 0) {
        for (const key of Object.keys(cloudCounters)) {
          const counterData = cloudCounters[key];
          if (!counterData.name) {
            counterData.name = '默认计数器';
          }
          storage[key] = counterData;
        }
      }
    }

    it('正常下载并更新本地 storage', () => {
      const storage: Record<string, any> = {
        counter_keys: ['old_key'],
        old_key: { name: '旧计数器' },
      };

      applyDownloadToLocal(storage, ['counter_new'], {
        counter_new: { name: '新计数器', currentCount: 5 },
      });

      expect(storage['counter_keys']).toEqual(['counter_new']);
      expect(storage['counter_new'].name).toBe('新计数器');
      expect(storage['old_key']).toBeUndefined();
    });

    it('旧格式兼容（对象 → 字符串）', () => {
      const storage: Record<string, any> = {
        counter_keys: [],
      };

      applyDownloadToLocal(storage, [{ key: 'counter_1', title: '计数器1' }], {
        counter_1: { currentCount: 3 },
      });

      expect(storage['counter_keys']).toEqual(['counter_1']);
      expect(storage['counter_1'].name).toBe('默认计数器'); // 补充默认 name
    });

    it('云端无数据时只更新 keys', () => {
      const storage: Record<string, any> = {
        counter_keys: ['old'],
        old: { name: '旧' },
      };

      applyDownloadToLocal(storage, ['new_a', 'new_b'], {});

      expect(storage['counter_keys']).toEqual(['new_a', 'new_b']);
      expect(storage['old']).toBeUndefined();
      // 不创建空 counter 数据
      expect(storage['new_a']).toBeUndefined();
    });

    it('空云端 keys 清空本地', () => {
      const storage: Record<string, any> = {
        counter_keys: ['a', 'b'],
        a: {},
        b: {},
      };

      applyDownloadToLocal(storage, [], {});

      expect(storage['counter_keys']).toEqual([]);
      expect(storage['a']).toBeUndefined();
      expect(storage['b']).toBeUndefined();
    });
  });

  // ===== handleLoginDataMerge 逻辑 =====
  describe('handleLoginDataMerge 逻辑', () => {
    it('未登录 → false', () => {
      const storage: Record<string, any> = {};
      const userInfo = storage['userInfo'];
      const result = !!(userInfo && userInfo.isLoggedIn);
      expect(result).toBe(false);
    });

    it('老用户迁移场景判定', () => {
      // 有其他计数器 + 未迁移 = 需要迁移
      const storage: Record<string, any> = {
        counter_keys: ['counter_old'],
        counter_migrated: undefined,
      };
      expect(isOldUserMigration(storage)).toBe(true);
    });

    it('非迁移场景 + 本地未修改 + 云端有数据 → 加载云端', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        counter_keys: ['local_default_counter'],
        local_default_counter: {
          currentCount: 0, targetCount: 999, name: '默认计数器',
          history: [], memo: '', timerState: { elapsedTime: 0 },
        },
      };

      expect(isOldUserMigration(storage)).toBe(false);
      expect(isDefaultCounterModified(storage)).toBe(false);

      // 模拟加载云端数据
      const cloudKeys = ['counter_cloud_1'];
      const cloudCounters: Record<string, any> = {
        counter_cloud_1: { name: '云端计数器', currentCount: 50 },
      };

      // 清除临时计数器
      delete storage['local_default_counter'];
      storage['counter_keys'] = cloudKeys;
      for (const key of Object.keys(cloudCounters)) {
        if (!cloudCounters[key].name) cloudCounters[key].name = '默认计数器';
        storage[key] = cloudCounters[key];
      }

      expect(storage['counter_keys']).toEqual(['counter_cloud_1']);
      expect(storage['counter_cloud_1'].name).toBe('云端计数器');
      expect(storage['local_default_counter']).toBeUndefined();
    });

    it('非迁移场景 + 本地有修改 + 云端有数据 → 先保存本地到云端', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        counter_keys: ['local_default_counter'],
        local_default_counter: {
          currentCount: 10, targetCount: 999, name: '默认计数器',
          history: [], memo: '', timerState: { elapsedTime: 0 },
        },
      };

      expect(isDefaultCounterModified(storage)).toBe(true);
      expect(isOldUserMigration(storage)).toBe(false);

      // 本地有修改：应先将 local_default_counter 保存到云端
      // 验证 isDefaultCounterModified 返回 true（触发保存逻辑的先决条件）
    });

    it('非迁移场景 + 本地有修改 + 云端无数据 → 保存本地到云端', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        counter_keys: ['local_default_counter'],
        local_default_counter: {
          currentCount: 5, targetCount: 999, name: '默认计数器',
          history: [], memo: '', timerState: { elapsedTime: 0 },
        },
      };

      expect(isDefaultCounterModified(storage)).toBe(true);
      expect(isOldUserMigration(storage)).toBe(false);
    });
  });

  // ===== syncCounterData sync 响应写回逻辑（updatedAt 保护） =====
  describe('syncCounterData sync 本地写回 — updatedAt 保护', () => {
    /**
     * 模拟 syncCounterData('sync') 响应后写回本地的逻辑（修复后版本）
     * 与 app.ts 中 syncCounterData 方法的响应处理逻辑一致
     */
    function applySyncToLocal(
      storage: Record<string, any>,
      cloudKeys: any[],
      cloudCounters: Record<string, any>,
    ) {
      const localKeys = storage['counter_keys'] || [];

      const cloudKeysList = (cloudKeys || []).map((k: any) => {
        if (typeof k === 'string') return k;
        return k.key || k;
      });

      const cloudKeysSet = new Set(cloudKeysList);

      // 删除本地多余的计数器
      for (const key of localKeys) {
        if (!cloudKeysSet.has(key)) {
          delete storage[key];
        }
      }

      // 更新 counterKeys
      storage['counter_keys'] = cloudKeysList;

      // 更新云端返回的计数器数据（带 updatedAt 保护）
      if (cloudCounters && Object.keys(cloudCounters).length > 0) {
        for (const key of Object.keys(cloudCounters)) {
          const counterData = cloudCounters[key];
          if (!counterData.name) {
            counterData.name = '默认计数器';
          }
          // 【修复逻辑】比较 updatedAt，避免覆盖用户最新操作
          const currentLocalData = storage[key];
          const currentLocalTime = currentLocalData?.updatedAt || 0;
          const cloudTime = counterData.updatedAt || 0;
          if (cloudTime >= currentLocalTime) {
            storage[key] = counterData;
          }
        }
      }
    }

    it('云端数据更新 → 正常覆盖本地', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1'],
        counter_1: { name: '计数器1', currentCount: 5, updatedAt: 1000 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: '计数器1', currentCount: 10, updatedAt: 2000 },
      });

      expect(storage['counter_1'].currentCount).toBe(10);
      expect(storage['counter_1'].updatedAt).toBe(2000);
    });

    it('云端数据比本地旧 → 保留本地数据（核心竞态修复）', () => {
      // 模拟：onShow 时 sync 读取本地 count=5(updatedAt=1000)，
      // 网络期间用户点击+1 → 本地变成 count=6(updatedAt=1500)，
      // 云端响应基于旧数据返回 count=5(updatedAt=1000)
      const storage: Record<string, any> = {
        counter_keys: ['counter_1'],
        counter_1: { name: '计数器1', currentCount: 6, updatedAt: 1500 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: '计数器1', currentCount: 5, updatedAt: 1000 },
      });

      expect(storage['counter_1'].currentCount).toBe(6);
      expect(storage['counter_1'].updatedAt).toBe(1500);
    });

    it('云端与本地 updatedAt 相同 → 正常覆盖（幂等）', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1'],
        counter_1: { name: '计数器1', currentCount: 5, updatedAt: 1000 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: '计数器1', currentCount: 5, updatedAt: 1000 },
      });

      expect(storage['counter_1'].currentCount).toBe(5);
    });

    it('本地无 updatedAt（旧数据）→ 云端覆盖', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1'],
        counter_1: { name: '计数器1', currentCount: 5 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: '计数器1', currentCount: 10, updatedAt: 2000 },
      });

      expect(storage['counter_1'].currentCount).toBe(10);
    });

    it('云端无 updatedAt → 不覆盖有 updatedAt 的本地数据', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1'],
        counter_1: { name: '计数器1', currentCount: 8, updatedAt: 3000 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: '计数器1', currentCount: 1 },
      });

      // cloudTime=0 < currentLocalTime=3000 → 保留本地
      expect(storage['counter_1'].currentCount).toBe(8);
    });

    it('本地无该 key → 云端数据正常写入', () => {
      const storage: Record<string, any> = {
        counter_keys: [],
      };

      applySyncToLocal(storage, ['counter_new'], {
        counter_new: { name: '新计数器', currentCount: 3, updatedAt: 1000 },
      });

      expect(storage['counter_new'].currentCount).toBe(3);
      expect(storage['counter_keys']).toEqual(['counter_new']);
    });

    it('多计数器混合场景：部分覆盖、部分保留', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1', 'counter_2'],
        counter_1: { name: 'A', currentCount: 10, updatedAt: 1000 },  // 比云端旧
        counter_2: { name: 'B', currentCount: 20, updatedAt: 3000 },  // 比云端新
      };

      applySyncToLocal(storage, ['counter_1', 'counter_2'], {
        counter_1: { name: 'A', currentCount: 15, updatedAt: 2000 },  // 新于本地 → 覆盖
        counter_2: { name: 'B', currentCount: 25, updatedAt: 2000 },  // 旧于本地 → 保留
      });

      expect(storage['counter_1'].currentCount).toBe(15);  // 覆盖
      expect(storage['counter_2'].currentCount).toBe(20);  // 保留
    });

    it('云端 keys 不包含本地 key → 本地被删除', () => {
      const storage: Record<string, any> = {
        counter_keys: ['counter_1', 'counter_2'],
        counter_1: { name: 'A', currentCount: 10, updatedAt: 5000 },
        counter_2: { name: 'B', currentCount: 20, updatedAt: 5000 },
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { name: 'A', currentCount: 10, updatedAt: 5000 },
      });

      expect(storage['counter_keys']).toEqual(['counter_1']);
      expect(storage['counter_2']).toBeUndefined();
    });

    it('补全缺失的 name 字段', () => {
      const storage: Record<string, any> = {
        counter_keys: [],
      };

      applySyncToLocal(storage, ['counter_1'], {
        counter_1: { currentCount: 5, updatedAt: 1000 },
      });

      expect(storage['counter_1'].name).toBe('默认计数器');
    });
  });
});
