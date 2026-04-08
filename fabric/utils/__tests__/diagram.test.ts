// 图解数据处理逻辑测试

/**
 * 图解数据结构
 */
interface DiagramItem {
  id: string;
  name: string;
  originalName: string;
  path: string;
  paths: string[];
  type: 'image' | 'pdf';
  createTime: number;
  lastAccessTime?: number;
  cover?: string;
  syncStatus?: 'local' | 'synced';
  size?: number;
}

/**
 * 排序图解列表（优先 lastAccessTime，其次 createTime）
 */
function sortDiagrams(items: DiagramItem[]): DiagramItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.lastAccessTime || 0;
    const bTime = b.lastAccessTime || 0;
    if (aTime !== bTime) return bTime - aTime;  // 最近操作的在前
    return b.createTime - a.createTime;  // 其次按创建时间
  });
}

/**
 * 过滤已同步图解
 */
function filterSyncedDiagrams(items: DiagramItem[]): DiagramItem[] {
  return items.filter(item => item.syncStatus === 'synced');
}

/**
 * 过滤本地图解
 */
function filterLocalDiagrams(items: DiagramItem[]): DiagramItem[] {
  return items.filter(item => item.syncStatus === 'local');
}

/**
 * 检查文件是否已存在（基于 size 去重）
 */
function checkDuplicateBySize(existingItems: DiagramItem[], newSize: number): DiagramItem | null {
  return existingItems.find(item => item.size === newSize) || null;
}

/**
 * 检查文件是否已存在（基于 id）
 */
function checkDuplicateById(existingItems: DiagramItem[], newId: string): DiagramItem | null {
  return existingItems.find(item => item.id === newId) || null;
}

/**
 * 检查图解数量限制
 */
function checkDiagramLimit(currentCount: number, isLoggedIn: boolean): { canAdd: boolean; message: string } {
  if (!isLoggedIn) {
    if (currentCount >= 1) {
      return { canAdd: false, message: '请登录以添加更多图解' };
    }
  } else {
    if (currentCount >= 10) {
      return { canAdd: false, message: '暂时最多只能创建10个图解' };
    }
  }
  return { canAdd: true, message: '' };
}

/**
 * 为旧数据添加默认 syncStatus（兼容迁移）
 */
function migrateDiagramData(items: DiagramItem[]): DiagramItem[] {
  return items.map(item => ({
    ...item,
    syncStatus: item.syncStatus || 'local',
    paths: item.paths || (item.path ? [item.path] : []),
  }));
}

/**
 * 获取封面路径（优先 cover，其次 paths[0]）
 */
function getCoverPath(item: DiagramItem): string {
  if (item.cover) return item.cover;
  if (item.paths && item.paths.length > 0) return item.paths[0];
  return item.path || '';
}

/**
 * 验证图解数据完整性
 */
function validateDiagramData(data: any): boolean {
  if (!data) return false;
  if (!data.id || typeof data.id !== 'string') return false;
  if (!data.name || typeof data.name !== 'string') return false;
  if (data.type !== 'image' && data.type !== 'pdf') return false;
  if (typeof data.createTime !== 'number') return false;
  return true;
}

describe('图解数据处理', () => {
  const mockDiagrams: DiagramItem[] = [
    { id: 'd1', name: '图解1', originalName: 'file1.jpg', path: '/path1', paths: ['/path1'], type: 'image', createTime: 100, lastAccessTime: 500, syncStatus: 'local' },
    { id: 'd2', name: '图解2', originalName: 'file2.jpg', path: '/path2', paths: ['/path2'], type: 'image', createTime: 200, lastAccessTime: 300, syncStatus: 'synced' },
    { id: 'd3', name: '图解3', originalName: 'file3.pdf', path: '/path3', paths: ['/path3'], type: 'pdf', createTime: 300, syncStatus: 'local' },
    { id: 'd4', name: '图解4', originalName: 'file4.jpg', path: '/path4', paths: ['/path4'], type: 'image', createTime: 400, lastAccessTime: 400, syncStatus: 'synced' },
  ];

  describe('sortDiagrams', () => {
    it('应按 lastAccessTime 降序排列', () => {
      const result = sortDiagrams(mockDiagrams);
      expect(result[0].id).toBe('d1'); // lastAccessTime: 500
      expect(result[1].id).toBe('d4'); // lastAccessTime: 400
      expect(result[2].id).toBe('d2'); // lastAccessTime: 300
      expect(result[3].id).toBe('d3'); // 无 lastAccessTime
    });

    it('无 lastAccessTime 应按 createTime 排序', () => {
      const items: DiagramItem[] = [
        { id: 'a', name: 'A', originalName: 'a.jpg', path: '/a', paths: ['/a'], type: 'image', createTime: 100 },
        { id: 'b', name: 'B', originalName: 'b.jpg', path: '/b', paths: ['/b'], type: 'image', createTime: 200 },
      ];

      const result = sortDiagrams(items);
      expect(result[0].id).toBe('b');
      expect(result[1].id).toBe('a');
    });

    it('空数组应返回空数组', () => {
      expect(sortDiagrams([])).toEqual([]);
    });
  });

  describe('filterSyncedDiagrams', () => {
    it('应只返回已同步图解', () => {
      const result = filterSyncedDiagrams(mockDiagrams);
      expect(result.length).toBe(2);
      expect(result.every(item => item.syncStatus === 'synced')).toBe(true);
    });

    it('无已同步图解应返回空数组', () => {
      const localItems = mockDiagrams.filter(item => item.syncStatus === 'local');
      expect(filterSyncedDiagrams(localItems)).toEqual([]);
    });
  });

  describe('filterLocalDiagrams', () => {
    it('应只返回本地图解', () => {
      const result = filterLocalDiagrams(mockDiagrams);
      expect(result.length).toBe(2);
      expect(result.every(item => item.syncStatus === 'local')).toBe(true);
    });
  });

  describe('checkDuplicateBySize', () => {
    it('相同 size 应返回已存在图解', () => {
      const existing: DiagramItem[] = [
        { id: 'd1', name: 'A', originalName: 'a.jpg', path: '/a', paths: [], type: 'image', createTime: 100, size: 1024 },
      ];

      const result = checkDuplicateBySize(existing, 1024);
      expect(result).not.toBe(null);
      expect(result?.id).toBe('d1');
    });

    it('不同 size 应返回 null', () => {
      const existing: DiagramItem[] = [
        { id: 'd1', name: 'A', originalName: 'a.jpg', path: '/a', paths: [], type: 'image', createTime: 100, size: 1024 },
      ];

      expect(checkDuplicateBySize(existing, 2048)).toBe(null);
    });

    it('空数组应返回 null', () => {
      expect(checkDuplicateBySize([], 1024)).toBe(null);
    });
  });

  describe('checkDuplicateById', () => {
    it('相同 id 应返回已存在图解', () => {
      const result = checkDuplicateById(mockDiagrams, 'd1');
      expect(result?.id).toBe('d1');
    });

    it('不存在 id 应返回 null', () => {
      expect(checkDuplicateById(mockDiagrams, 'd999')).toBe(null);
    });
  });

  describe('checkDiagramLimit', () => {
    it('未登录0个图解应允许添加', () => {
      const result = checkDiagramLimit(0, false);
      expect(result.canAdd).toBe(true);
    });

    it('未登录1个图解应禁止添加', () => {
      const result = checkDiagramLimit(1, false);
      expect(result.canAdd).toBe(false);
      expect(result.message).toBe('请登录以添加更多图解');
    });

    it('已登录9个图解应允许添加', () => {
      const result = checkDiagramLimit(9, true);
      expect(result.canAdd).toBe(true);
    });

    it('已登录10个图解应禁止添加', () => {
      const result = checkDiagramLimit(10, true);
      expect(result.canAdd).toBe(false);
      expect(result.message).toBe('暂时最多只能创建10个图解');
    });

    it('已登录15个图解应禁止添加', () => {
      const result = checkDiagramLimit(15, true);
      expect(result.canAdd).toBe(false);
    });
  });

  describe('migrateDiagramData', () => {
    it('无 syncStatus 应添加默认值', () => {
      const oldData: any[] = [
        { id: 'd1', name: 'A', path: '/a', type: 'image', createTime: 100 },
      ];

      const result = migrateDiagramData(oldData);
      expect(result[0].syncStatus).toBe('local');
    });

    it('无 paths 应从 path 生成', () => {
      const oldData: any[] = [
        { id: 'd1', name: 'A', path: '/a', type: 'image', createTime: 100, syncStatus: 'local' },
      ];

      const result = migrateDiagramData(oldData);
      expect(result[0].paths).toEqual(['/a']);
    });

    it('已有 syncStatus 应保持不变', () => {
      const result = migrateDiagramData(mockDiagrams);
      expect(result.find(d => d.id === 'd2')?.syncStatus).toBe('synced');
      expect(result.find(d => d.id === 'd1')?.syncStatus).toBe('local');
    });
  });

  describe('getCoverPath', () => {
    it('有 cover 应返回 cover', () => {
      const item: DiagramItem = { ...mockDiagrams[0], cover: '/custom-cover.jpg' };
      expect(getCoverPath(item)).toBe('/custom-cover.jpg');
    });

    it('无 cover 有 paths 应返回 paths[0]', () => {
      const item: DiagramItem = { ...mockDiagrams[0], cover: undefined, paths: ['/p1', '/p2'] };
      expect(getCoverPath(item)).toBe('/p1');
    });

    it('无 cover 无 paths 有 path 应返回 path', () => {
      const item: DiagramItem = { ...mockDiagrams[0], cover: undefined, paths: [], path: '/fallback.jpg' };
      expect(getCoverPath(item)).toBe('/fallback.jpg');
    });

    it('全部为空应返回空字符串', () => {
      const item: DiagramItem = { ...mockDiagrams[0], cover: undefined, paths: [], path: '' };
      expect(getCoverPath(item)).toBe('');
    });
  });

  describe('validateDiagramData', () => {
    it('有效数据应返回 true', () => {
      expect(validateDiagramData(mockDiagrams[0])).toBe(true);
    });

    it('null 应返回 false', () => {
      expect(validateDiagramData(null)).toBe(false);
    });

    it('缺少 id 应返回 false', () => {
      expect(validateDiagramData({ ...mockDiagrams[0], id: undefined })).toBe(false);
    });

    it('缺少 name 应返回 false', () => {
      expect(validateDiagramData({ ...mockDiagrams[0], name: undefined })).toBe(false);
    });

    it('无效 type 应返回 false', () => {
      expect(validateDiagramData({ ...mockDiagrams[0], type: 'doc' })).toBe(false);
    });

    it('缺少 createTime 应返回 false', () => {
      expect(validateDiagramData({ ...mockDiagrams[0], createTime: undefined })).toBe(false);
    });
  });
});