// 账号状态与用户数据处理逻辑测试

/**
 * 用户信息结构
 */
interface UserInfo {
  isLoggedIn: boolean;
  openid?: string;
  nickName: string;
  avatarUrl: string;
  zhizhiId?: string;
  zhizhiIdModified?: boolean;
}

/**
 * 检查是否需要显示登录引导弹窗
 */
function shouldShowLoginPrompt(isLoggedIn: boolean, localDiagramCount: number): boolean {
  return !isLoggedIn && localDiagramCount >= 1;
}

/**
 * 检查知织ID格式是否有效（9位数字）
 */
function validateZhizhiId(zhizhiId: string): boolean {
  return /^\d{9}$/.test(zhizhiId);
}

/**
 * 生成随机9位知织ID
 */
function generateZhizhiId(): string {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

/**
 * 检查用户是否可以修改知织ID
 */
function canModifyZhizhiId(zhizhiIdModified: boolean): boolean {
  return !zhizhiIdModified;
}

/**
 * 检查账号是否失效（通过云函数返回结果）
 */
function isAccountInvalidated(result: any): boolean {
  if (!result) return false;
  if (result.error === '用户不存在' || result.error === '用户不存在，请先登录') {
    return true;
  }
  return false;
}

/**
 * 计算退出登录时应保留的图解
 */
function filterDiagramsOnLogout(diagrams: any[]): { toKeep: any[]; toRemove: any[] } {
  const toKeep = diagrams.filter(item => item.syncStatus !== 'synced');
  const toRemove = diagrams.filter(item => item.syncStatus === 'synced');
  return { toKeep, toRemove };
}

/**
 * 注销账号时应清理的数据
 */
function getDataToCleanOnAccountDeletion(userInfo: UserInfo | null): string[] {
  const keysToClean = [
    'userInfo',
    'total_zhizhi_time',
    'local_avatar_path',
    'local_avatar_file_id',
  ];

  if (userInfo?.zhizhiId) {
    keysToClean.push(`counter_keys`);
    // 计数器数据
  }

  return keysToClean;
}

/**
 * 检查是否为默认计数器（未修改）
 */
function isDefaultCounterModified(counterData: any): boolean {
  return !(
    counterData.name === '默认计数器' &&
    counterData.currentCount === 0 &&
    counterData.targetCount === 999 &&
    (!counterData.history || counterData.history.length === 0) &&
    (!counterData.memo || counterData.memo === '')
  );
}

/**
 * 登录时数据合并策略
 */
function determineMergeStrategy(
  localCounterModified: boolean,
  hasCloudData: boolean
): 'use_cloud' | 'merge' | 'use_local' {
  if (!hasCloudData) return 'use_local';
  if (localCounterModified) return 'merge';
  return 'use_cloud';
}

describe('账号状态与用户数据处理', () => {
  describe('shouldShowLoginPrompt', () => {
    it('未登录且有1个图解应显示提示', () => {
      expect(shouldShowLoginPrompt(false, 1)).toBe(true);
    });

    it('未登录且有0个图解不应显示提示', () => {
      expect(shouldShowLoginPrompt(false, 0)).toBe(false);
    });

    it('已登录且有图解不应显示提示', () => {
      expect(shouldShowLoginPrompt(true, 5)).toBe(false);
    });

    it('未登录且有多个图解应显示提示', () => {
      expect(shouldShowLoginPrompt(false, 3)).toBe(true);
    });
  });

  describe('validateZhizhiId', () => {
    it('有效9位数字应返回 true', () => {
      expect(validateZhizhiId('123456789')).toBe(true);
    });

    it('8位数字应返回 false', () => {
      expect(validateZhizhiId('12345678')).toBe(false);
    });

    it('10位数字应返回 false', () => {
      expect(validateZhizhiId('1234567890')).toBe(false);
    });

    it('包含字母应返回 false', () => {
      expect(validateZhizhiId('12345678a')).toBe(false);
    });

    it('空字符串应返回 false', () => {
      expect(validateZhizhiId('')).toBe(false);
    });

    it('全0应返回 true', () => {
      expect(validateZhizhiId('000000000')).toBe(true);
    });
  });

  describe('generateZhizhiId', () => {
    it('应生成9位数字', () => {
      const id = generateZhizhiId();
      expect(id.length).toBe(9);
      expect(/^\d{9}$/.test(id)).toBe(true);
    });

    it('应生成多个不同的ID', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateZhizhiId());
      }
      // 100次生成应该至少有95个不同的ID（允许少量重复）
      expect(ids.size).toBeGreaterThan(95);
    });

    it('首位不应为0', () => {
      for (let i = 0; i < 10; i++) {
        const id = generateZhizhiId();
        expect(id[0]).not.toBe('0');
      }
    });
  });

  describe('canModifyZhizhiId', () => {
    it('未修改过应可以修改', () => {
      expect(canModifyZhizhiId(false)).toBe(true);
    });

    it('已修改过应不可以修改', () => {
      expect(canModifyZhizhiId(true)).toBe(false);
    });
  });

  describe('isAccountInvalidated', () => {
    it('用户不存在应返回 true', () => {
      expect(isAccountInvalidated({ error: '用户不存在' })).toBe(true);
    });

    it('用户不存在提示应返回 true', () => {
      expect(isAccountInvalidated({ error: '用户不存在，请先登录' })).toBe(true);
    });

    it('其他错误应返回 false', () => {
      expect(isAccountInvalidated({ error: '网络错误' })).toBe(false);
    });

    it('成功结果应返回 false', () => {
      expect(isAccountInvalidated({ success: true })).toBe(false);
    });

    it('null 应返回 false', () => {
      expect(isAccountInvalidated(null)).toBe(false);
    });

    it('undefined 应返回 false', () => {
      expect(isAccountInvalidated(undefined)).toBe(false);
    });
  });

  describe('filterDiagramsOnLogout', () => {
    const diagrams = [
      { id: 'd1', syncStatus: 'local' },
      { id: 'd2', syncStatus: 'synced' },
      { id: 'd3', syncStatus: 'local' },
      { id: 'd4', syncStatus: 'synced' },
    ];

    it('应保留未同步图解', () => {
      const { toKeep } = filterDiagramsOnLogout(diagrams);
      expect(toKeep.length).toBe(2);
      expect(toKeep.every(d => d.syncStatus === 'local')).toBe(true);
    });

    it('应标记要删除已同步图解', () => {
      const { toRemove } = filterDiagramsOnLogout(diagrams);
      expect(toRemove.length).toBe(2);
      expect(toRemove.every(d => d.syncStatus === 'synced')).toBe(true);
    });

    it('全部本地图解应全部保留', () => {
      const localDiagrams = diagrams.filter(d => d.syncStatus === 'local');
      const { toKeep, toRemove } = filterDiagramsOnLogout(localDiagrams);
      expect(toKeep.length).toBe(2);
      expect(toRemove.length).toBe(0);
    });

    it('全部已同步应全部删除', () => {
      const syncedDiagrams = diagrams.filter(d => d.syncStatus === 'synced');
      const { toKeep, toRemove } = filterDiagramsOnLogout(syncedDiagrams);
      expect(toKeep.length).toBe(0);
      expect(toRemove.length).toBe(2);
    });
  });

  describe('getDataToCleanOnAccountDeletion', () => {
    it('应返回需要清理的 keys', () => {
      const userInfo: UserInfo = {
        isLoggedIn: true,
        nickName: 'Test',
        avatarUrl: '',
        zhizhiId: '123456789',
      };

      const keys = getDataToCleanOnAccountDeletion(userInfo);
      expect(keys).toContain('userInfo');
      expect(keys).toContain('total_zhizhi_time');
      expect(keys).toContain('local_avatar_path');
      expect(keys).toContain('local_avatar_file_id');
    });

    it('无用户信息应返回基础 keys', () => {
      const keys = getDataToCleanOnAccountDeletion(null);
      expect(keys).toContain('userInfo');
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('isDefaultCounterModified', () => {
    const defaultCounter = {
      name: '默认计数器',
      currentCount: 0,
      targetCount: 999,
      history: [],
      memo: '',
    };

    it('默认计数器应返回 false（未修改）', () => {
      expect(isDefaultCounterModified(defaultCounter)).toBe(false);
    });

    it('修改过名称应返回 true', () => {
      expect(isDefaultCounterModified({ ...defaultCounter, name: '我的计数器' })).toBe(true);
    });

    it('修改过计数应返回 true', () => {
      expect(isDefaultCounterModified({ ...defaultCounter, currentCount: 10 })).toBe(true);
    });

    it('修改过目标应返回 true', () => {
      expect(isDefaultCounterModified({ ...defaultCounter, targetCount: 100 })).toBe(true);
    });

    it('有历史记录应返回 true', () => {
      expect(isDefaultCounterModified({ ...defaultCounter, history: [{ id: 1 }] })).toBe(true);
    });

    it('有备忘录应返回 true', () => {
      expect(isDefaultCounterModified({ ...defaultCounter, memo: 'test' })).toBe(true);
    });
  });

  describe('determineMergeStrategy', () => {
    it('无云端数据应使用本地', () => {
      expect(determineMergeStrategy(true, false)).toBe('use_local');
      expect(determineMergeStrategy(false, false)).toBe('use_local');
    });

    it('有云端数据且本地已修改应合并', () => {
      expect(determineMergeStrategy(true, true)).toBe('merge');
    });

    it('有云端数据且本地未修改应使用云端', () => {
      expect(determineMergeStrategy(false, true)).toBe('use_cloud');
    });
  });
});