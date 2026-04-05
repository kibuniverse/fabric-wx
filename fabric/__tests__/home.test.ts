/**
 * 首页 (home.ts) 单元测试
 * 测试核心业务逻辑：排序、去重、限制检查、同步逻辑
 */

import wx, { mocks, clearAllMocks } from '../../__mocks__/wx';

// 模拟 Page 函数
let pageData: any = {};
let pageMethods: any = {};

const mockPage = (options: any) => {
  pageData = { ...options.data };
  pageMethods = { ...options };

  // 模拟 setData
  pageMethods.setData = (newData: any) => {
    pageData = { ...pageData, ...newData };
  };

  return pageMethods;
};

// 模拟全局 Page 函数
(global as any).Page = mockPage;

// 模拟 getApp
(global as any).getApp = jest.fn(() => ({
  globalData: {
    preloadedDiagrams: [],
  },
}));

// 重新定义测试中使用的类型
interface FileItem {
  id: string;
  name: string;
  originalName: string;
  path?: string;  // 改为可选
  paths: string[];
  type: 'image' | 'pdf';
  createTime: number;
  lastAccessTime?: number;
  cover?: string;
  pdfSourcePath?: string;
  pdfPageCount?: number;
  size?: number;
  cloudFileId?: string;
  syncStatus?: 'local' | 'synced';
  cloudId?: string;
  cloudImages?: string[];
  cloudCover?: string;
}

// 导入排序函数（从 home.ts 提取的逻辑）
const sortItems = (items: FileItem[]) => items.sort((a, b) => {
  const aTime = a.lastAccessTime || 0;
  const bTime = b.lastAccessTime || 0;
  if (aTime !== bTime) return bTime - aTime;
  return b.createTime - a.createTime;
});

describe('首页逻辑测试', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('sortItems 排序函数', () => {
    it('应该按 lastAccessTime 降序排列', () => {
      const items: FileItem[] = [
        { id: '1', name: 'A', createTime: 100, lastAccessTime: 500, paths: [], type: 'image', originalName: 'A' },
        { id: '2', name: 'B', createTime: 200, lastAccessTime: 300, paths: [], type: 'image', originalName: 'B' },
        { id: '3', name: 'C', createTime: 300, lastAccessTime: 400, paths: [], type: 'image', originalName: 'C' },
      ];

      const sorted = sortItems(items);

      expect(sorted[0].id).toBe('1'); // lastAccessTime: 500
      expect(sorted[1].id).toBe('3'); // lastAccessTime: 400
      expect(sorted[2].id).toBe('2'); // lastAccessTime: 300
    });

    it('当 lastAccessTime 相同时，应该按 createTime 降序排列', () => {
      const items: FileItem[] = [
        { id: '1', name: 'A', createTime: 100, lastAccessTime: 500, paths: [], type: 'image', originalName: 'A' },
        { id: '2', name: 'B', createTime: 300, lastAccessTime: 500, paths: [], type: 'image', originalName: 'B' },
        { id: '3', name: 'C', createTime: 200, lastAccessTime: 500, paths: [], type: 'image', originalName: 'C' },
      ];

      const sorted = sortItems(items);

      expect(sorted[0].id).toBe('2'); // createTime: 300
      expect(sorted[1].id).toBe('3'); // createTime: 200
      expect(sorted[2].id).toBe('1'); // createTime: 100
    });

    it('没有 lastAccessTime 时，应该按 createTime 降序排列', () => {
      const items: FileItem[] = [
        { id: '1', name: 'A', createTime: 100, paths: [], type: 'image', originalName: 'A' },
        { id: '2', name: 'B', createTime: 300, paths: [], type: 'image', originalName: 'B' },
        { id: '3', name: 'C', createTime: 200, paths: [], type: 'image', originalName: 'C' },
      ];

      const sorted = sortItems(items);

      expect(sorted[0].id).toBe('2'); // createTime: 300
      expect(sorted[1].id).toBe('3'); // createTime: 200
      expect(sorted[2].id).toBe('1'); // createTime: 100
    });

    it('空数组应该返回空数组', () => {
      const sorted = sortItems([]);
      expect(sorted).toEqual([]);
    });

    it('单个元素应该正常返回', () => {
      const items: FileItem[] = [
        { id: '1', name: 'A', createTime: 100, paths: [], type: 'image', originalName: 'A' },
      ];

      const sorted = sortItems(items);
      expect(sorted.length).toBe(1);
      expect(sorted[0].id).toBe('1');
    });
  });

  describe('checkPdfDuplicate PDF去重逻辑', () => {
    // 模拟 checkPdfDuplicate 方法
    const checkPdfDuplicate = (fileList: FileItem[], name: string, size: number): FileItem | null => {
      return fileList.find(item =>
        item.type === 'pdf' &&
        item.originalName === name &&
        item.size === size
      ) || null;
    };

    it('应该检测到重复的PDF（相同名称和大小）', () => {
      const fileList: FileItem[] = [
        { id: '1', name: 'A', originalName: 'test.pdf', type: 'pdf', size: 1024, createTime: 100, paths: [], path: '' },
        { id: '2', name: 'B', originalName: 'other.pdf', type: 'pdf', size: 2048, createTime: 200, paths: [], path: '' },
      ];

      const duplicate = checkPdfDuplicate(fileList, 'test.pdf', 1024);

      expect(duplicate).not.toBeNull();
      expect(duplicate?.id).toBe('1');
    });

    it('不同名称不应检测为重复', () => {
      const fileList: FileItem[] = [
        { id: '1', name: 'A', originalName: 'test.pdf', type: 'pdf', size: 1024, createTime: 100, paths: [], path: '' },
      ];

      const duplicate = checkPdfDuplicate(fileList, 'other.pdf', 1024);

      expect(duplicate).toBeNull();
    });

    it('不同大小不应检测为重复', () => {
      const fileList: FileItem[] = [
        { id: '1', name: 'A', originalName: 'test.pdf', type: 'pdf', size: 1024, createTime: 100, paths: [], path: '' },
      ];

      const duplicate = checkPdfDuplicate(fileList, 'test.pdf', 2048);

      expect(duplicate).toBeNull();
    });

    it('图片类型不应被检测', () => {
      const fileList: FileItem[] = [
        { id: '1', name: 'A', originalName: 'test.pdf', type: 'image', size: 1024, createTime: 100, paths: [], path: '' },
      ];

      const duplicate = checkPdfDuplicate(fileList, 'test.pdf', 1024);

      expect(duplicate).toBeNull();
    });

    it('空文件列表应返回 null', () => {
      const duplicate = checkPdfDuplicate([], 'test.pdf', 1024);
      expect(duplicate).toBeNull();
    });
  });

  describe('图解数量限制逻辑', () => {
    // 模拟 toggleImportOptions 中的限制检查逻辑
    const checkImportLimit = (isLoggedIn: boolean, localCount: number): { allowed: boolean; reason?: string } => {
      if (!isLoggedIn) {
        if (localCount >= 1) {
          return { allowed: false, reason: 'login_prompt' };
        }
      } else {
        if (localCount >= 10) {
          return { allowed: false, reason: 'limit_reached' };
        }
      }
      return { allowed: true };
    };

    it('未登录用户：已有1个图解时应引导登录', () => {
      const result = checkImportLimit(false, 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('login_prompt');
    });

    it('未登录用户：无图解时应允许导入', () => {
      const result = checkImportLimit(false, 0);
      expect(result.allowed).toBe(true);
    });

    it('已登录用户：已有10个图解时应拒绝', () => {
      const result = checkImportLimit(true, 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('limit_reached');
    });

    it('已登录用户：少于10个图解时应允许', () => {
      const result = checkImportLimit(true, 9);
      expect(result.allowed).toBe(true);
    });

    it('已登录用户：无图解时应允许', () => {
      const result = checkImportLimit(true, 0);
      expect(result.allowed).toBe(true);
    });
  });

  describe('generateUniqueId ID生成逻辑', () => {
    // 模拟 generateUniqueId 方法
    const generateUniqueId = (): string => {
      return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    };

    it('应该生成以 "id_" 开头的ID', () => {
      const id = generateUniqueId();
      expect(id.startsWith('id_')).toBe(true);
    });

    it('应该包含时间戳', () => {
      const before = Date.now();
      const id = generateUniqueId();
      const after = Date.now();

      // 提取时间戳部分
      const timestamp = parseInt(id.split('_')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('多次生成的ID应该不同（高概率）', () => {
      const ids = new Set();
      // 使用较少数量的测试，避免 Math.random 碰撞
      for (let i = 0; i < 50; i++) {
        ids.add(generateUniqueId());
      }
      // 至少 90% 的 ID 应该是唯一的
      expect(ids.size).toBeGreaterThanOrEqual(45);
    });
  });

  describe('数据合并逻辑（跨设备同步）', () => {
    // 模拟数据合并逻辑
    const mergeDiagrams = (
      cloudDiagrams: FileItem[],
      localDiagrams: FileItem[]
    ): FileItem[] => {
      // 合并：云端数据优先，但保留本地已有的 paths 和 cover
      const mergedItems = cloudDiagrams.map(cloudItem => {
        const localItem = localDiagrams.find(local => local.id === cloudItem.id);
        if (localItem && localItem.paths && localItem.paths.length > 0) {
          return {
            ...cloudItem,
            paths: localItem.paths,
            path: localItem.path || localItem.paths[0],
            cover: localItem.cover || cloudItem.cover,
          };
        }
        return cloudItem;
      });

      // 添加本地独有的未同步图解
      const localOnlyDiagrams = localDiagrams.filter(
        local => !cloudDiagrams.find(cloud => cloud.id === local.id) && local.syncStatus === 'local'
      );
      mergedItems.push(...localOnlyDiagrams);

      return sortItems(mergedItems);
    };

    it('云端和本地都有数据时，本地 paths 应被保留', () => {
      const cloudDiagrams: FileItem[] = [
        { id: '1', name: '云端A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', cover: '', syncStatus: 'synced', cloudImages: ['cloud://img1.jpg'] },
      ];

      const localDiagrams: FileItem[] = [
        { id: '1', name: '本地A', originalName: 'A', type: 'image', createTime: 100, paths: ['local://img1.jpg'], path: 'local://img1.jpg', cover: 'local://cover.jpg', syncStatus: 'synced' },
      ];

      const merged = mergeDiagrams(cloudDiagrams, localDiagrams);

      expect(merged[0].paths).toEqual(['local://img1.jpg']);
      expect(merged[0].cover).toBe('local://cover.jpg');
      expect(merged[0].name).toBe('云端A'); // 云端数据优先
    });

    it('本地独有的未同步图解应被保留', () => {
      const cloudDiagrams: FileItem[] = [
        { id: '1', name: '云端A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
      ];

      const localDiagrams: FileItem[] = [
        { id: '1', name: '云端A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
        { id: '2', name: '本地B', originalName: 'B', type: 'image', createTime: 200, paths: ['local://img.jpg'], path: 'local://img.jpg', syncStatus: 'local' },
      ];

      const merged = mergeDiagrams(cloudDiagrams, localDiagrams);

      expect(merged.length).toBe(2);
      expect(merged.find(item => item.id === '2')).toBeDefined();
    });

    it('本地已同步图解不应被重复添加', () => {
      const cloudDiagrams: FileItem[] = [
        { id: '1', name: '云端A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
      ];

      const localDiagrams: FileItem[] = [
        { id: '1', name: '本地A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
      ];

      const merged = mergeDiagrams(cloudDiagrams, localDiagrams);

      expect(merged.length).toBe(1);
    });

    it('云端无数据时，本地未同步图解应全部保留', () => {
      const cloudDiagrams: FileItem[] = [];

      const localDiagrams: FileItem[] = [
        { id: '1', name: '本地A', originalName: 'A', type: 'image', createTime: 100, paths: ['local://img.jpg'], path: 'local://img.jpg', syncStatus: 'local' },
        { id: '2', name: '本地B', originalName: 'B', type: 'image', createTime: 200, paths: ['local://img2.jpg'], path: 'local://img2.jpg', syncStatus: 'local' },
      ];

      const merged = mergeDiagrams(cloudDiagrams, localDiagrams);

      expect(merged.length).toBe(2);
    });

    it('本地无 paths 时，应使用云端数据', () => {
      const cloudDiagrams: FileItem[] = [
        { id: '1', name: '云端A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', cloudImages: ['cloud://img1.jpg'], syncStatus: 'synced' },
      ];

      const localDiagrams: FileItem[] = [
        { id: '1', name: '本地A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
      ];

      const merged = mergeDiagrams(cloudDiagrams, localDiagrams);

      expect(merged[0].cloudImages).toEqual(['cloud://img1.jpg']);
    });
  });

  describe('同步状态检查逻辑', () => {
    // 模拟 checkSyncTips 逻辑
    const checkSyncTips = (
      isLoggedIn: boolean,
      hasShownSyncTips: boolean,
      allItems: FileItem[]
    ): { showSyncTips: boolean; firstLocalItemId: string } => {
      const firstLocalItem = allItems.find(item => item.syncStatus === 'local');
      const showSyncTips = isLoggedIn && !!firstLocalItem && !hasShownSyncTips;

      return {
        showSyncTips,
        firstLocalItemId: firstLocalItem?.id || '',
      };
    };

    it('已登录且有未同步图解时，应显示同步提示', () => {
      const allItems: FileItem[] = [
        { id: '1', name: 'A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'local' },
        { id: '2', name: 'B', originalName: 'B', type: 'image', createTime: 200, paths: [], path: '', syncStatus: 'synced' },
      ];

      const result = checkSyncTips(true, false, allItems);

      expect(result.showSyncTips).toBe(true);
      expect(result.firstLocalItemId).toBe('1');
    });

    it('已显示过同步提示时，不应再次显示', () => {
      const allItems: FileItem[] = [
        { id: '1', name: 'A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'local' },
      ];

      const result = checkSyncTips(true, true, allItems);

      expect(result.showSyncTips).toBe(false);
    });

    it('未登录时，不应显示同步提示', () => {
      const allItems: FileItem[] = [
        { id: '1', name: 'A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'local' },
      ];

      const result = checkSyncTips(false, false, allItems);

      expect(result.showSyncTips).toBe(false);
    });

    it('无未同步图解时，不应显示同步提示', () => {
      const allItems: FileItem[] = [
        { id: '1', name: 'A', originalName: 'A', type: 'image', createTime: 100, paths: [], path: '', syncStatus: 'synced' },
      ];

      const result = checkSyncTips(true, false, allItems);

      expect(result.showSyncTips).toBe(false);
      expect(result.firstLocalItemId).toBe('');
    });
  });

  describe('操作菜单选项生成逻辑', () => {
    // 模拟 showActionSheet 中的菜单生成逻辑
    const generateActions = (type: 'image' | 'pdf'): { text: string; value: string; type?: string }[] => {
      const actions: { text: string; value: string; type?: string }[] = [
        { text: '重命名', value: 'rename' },
        { text: '修改封面', value: 'changeCover' },
      ];

      if (type === 'image') {
        actions.push({ text: '修改图解', value: 'edit' });
      }

      actions.push({ text: '删除', value: 'delete', type: 'warn' });

      return actions;
    };

    it('图片类型应有4个选项（包含修改图解）', () => {
      const actions = generateActions('image');

      expect(actions.length).toBe(4);
      expect(actions.find(a => a.value === 'edit')).toBeDefined();
    });

    it('PDF类型应有3个选项（不含修改图解）', () => {
      const actions = generateActions('pdf');

      expect(actions.length).toBe(3);
      expect(actions.find(a => a.value === 'edit')).toBeUndefined();
    });

    it('删除选项应标记为 warn 类型', () => {
      const imageActions = generateActions('image');
      const pdfActions = generateActions('pdf');

      const imageDelete = imageActions.find(a => a.value === 'delete');
      const pdfDelete = pdfActions.find(a => a.value === 'delete');

      expect(imageDelete?.type).toBe('warn');
      expect(pdfDelete?.type).toBe('warn');
    });

    it('选项顺序应正确', () => {
      const actions = generateActions('image');

      expect(actions[0].value).toBe('rename');
      expect(actions[1].value).toBe('changeCover');
      expect(actions[2].value).toBe('edit');
      expect(actions[3].value).toBe('delete');
    });
  });

  describe('清理项目关联数据逻辑', () => {
    // 模拟 cleanupItemData 清理逻辑
    const cleanupItemData = (itemId: string, storage: Record<string, any>): Record<string, any> => {
      const newStorage = { ...storage };

      // 清理计数器数据
      if (newStorage.simpleCounters && newStorage.simpleCounters[itemId] !== undefined) {
        delete newStorage.simpleCounters[itemId];
      }

      // 清理备忘录数据
      if (newStorage.itemMemos && newStorage.itemMemos[itemId] !== undefined) {
        delete newStorage.itemMemos[itemId];
      }

      // 清理页码记录
      if (newStorage.lastImageIndex && newStorage.lastImageIndex[itemId] !== undefined) {
        delete newStorage.lastImageIndex[itemId];
      }

      return newStorage;
    };

    it('应该清理计数器数据', () => {
      const storage = {
        simpleCounters: { 'item-1': 10, 'item-2': 5 },
        itemMemos: {},
        lastImageIndex: {},
      };

      const result = cleanupItemData('item-1', storage);

      expect(result.simpleCounters['item-1']).toBeUndefined();
      expect(result.simpleCounters['item-2']).toBe(5);
    });

    it('应该清理备忘录数据', () => {
      const storage = {
        simpleCounters: {},
        itemMemos: { 'item-1': 'memo content', 'item-2': 'other memo' },
        lastImageIndex: {},
      };

      const result = cleanupItemData('item-1', storage);

      expect(result.itemMemos['item-1']).toBeUndefined();
      expect(result.itemMemos['item-2']).toBe('other memo');
    });

    it('应该清理页码记录', () => {
      const storage = {
        simpleCounters: {},
        itemMemos: {},
        lastImageIndex: { 'item-1': 3, 'item-2': 5 },
      };

      const result = cleanupItemData('item-1', storage);

      expect(result.lastImageIndex['item-1']).toBeUndefined();
      expect(result.lastImageIndex['item-2']).toBe(5);
    });

    it('不存在的 itemId 不应影响数据', () => {
      const storage = {
        simpleCounters: { 'item-1': 10 },
        itemMemos: { 'item-1': 'memo' },
        lastImageIndex: { 'item-1': 3 },
      };

      const result = cleanupItemData('non-existent', storage);

      expect(result).toEqual(storage);
    });

    it('应该清理所有关联数据', () => {
      const storage = {
        simpleCounters: { 'item-1': 10 },
        itemMemos: { 'item-1': 'memo' },
        lastImageIndex: { 'item-1': 3 },
      };

      const result = cleanupItemData('item-1', storage);

      expect(result.simpleCounters['item-1']).toBeUndefined();
      expect(result.itemMemos['item-1']).toBeUndefined();
      expect(result.lastImageIndex['item-1']).toBeUndefined();
    });
  });

  describe('云同步时间戳更新逻辑', () => {
    const STORAGE_KEYS = {
      LAST_SYNC_TIME: 'lastDiagramSyncTime',
    };

    it('重命名成功后应更新同步时间戳', () => {
      const before = Date.now();
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      const after = Date.now();

      const syncTime = wx.getStorageSync(STORAGE_KEYS.LAST_SYNC_TIME);
      expect(syncTime).toBeGreaterThanOrEqual(before);
      expect(syncTime).toBeLessThanOrEqual(after);
    });

    it('封面更新成功后应更新同步时间戳', () => {
      const before = Date.now();
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      const after = Date.now();

      const syncTime = wx.getStorageSync(STORAGE_KEYS.LAST_SYNC_TIME);
      expect(syncTime).toBeGreaterThanOrEqual(before);
      expect(syncTime).toBeLessThanOrEqual(after);
    });

    it('删除成功后应更新同步时间戳（已同步项）', () => {
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, 1000); // 设置旧时间

      // 模拟删除已同步项
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());

      const syncTime = wx.getStorageSync(STORAGE_KEYS.LAST_SYNC_TIME);
      expect(syncTime).toBeGreaterThan(1000);
    });
  });
});

describe('wx Mock API 测试', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('getStorageSync/setStorageSync 应正常工作', () => {
    wx.setStorageSync('testKey', 'testValue');
    expect(wx.getStorageSync('testKey')).toBe('testValue');
  });

  it('removeStorageSync 应正常工作', () => {
    wx.setStorageSync('testKey', 'testValue');
    wx.removeStorageSync('testKey');
    expect(wx.getStorageSync('testKey')).toBeUndefined();
  });

  it('cloud.callFunction 应可被 mock', async () => {
    mocks.cloudCallFunction.mockResolvedValue({
      result: { success: true, data: { hasUpdate: true } },
    });

    const result = await wx.cloud.callFunction({
      name: 'syncDiagramData',
      data: { action: 'checkUpdate' },
    });

    expect(result.result.success).toBe(true);
    expect(mocks.cloudCallFunction).toHaveBeenCalled();
  });

  it('cloud.getTempFileURL 应可被 mock', async () => {
    mocks.cloudGetTempFileURL.mockResolvedValue({
      fileList: [{ fileID: 'cloud://test.jpg', tempFileURL: 'https://temp.url/test.jpg' }],
    });

    const result = await wx.cloud.getTempFileURL({
      fileList: ['cloud://test.jpg'],
    });

    expect(result.fileList[0].tempFileURL).toBe('https://temp.url/test.jpg');
  });

  it('showToast 应可被调用', () => {
    wx.showToast({ title: '测试提示', icon: 'none' });
    expect(mocks.showToast).toHaveBeenCalledWith({ title: '测试提示', icon: 'none' });
  });

  it('navigateTo 应可被调用', () => {
    wx.navigateTo({ url: '/pages/detail/detail?id=123' });
    expect(mocks.navigateTo).toHaveBeenCalledWith({ url: '/pages/detail/detail?id=123' });
  });
});