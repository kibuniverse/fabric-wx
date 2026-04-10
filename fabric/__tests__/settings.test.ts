/**
 * settings.ts 核心逻辑单元测试
 * 测试：图解清理、文件删除、注销流程、退出登录流程
 */

import { clearAllMocks } from '../../__mocks__/wx';

// ========== 从 settings.ts 提取的纯函数/逻辑 ==========

/** 删除图解关联的所有本地文件 */
function removeDiagramFiles(item: any, removedFiles: string[]) {
  if (item.paths && item.paths.length > 0) {
    removedFiles.push(...item.paths);
  }
  if (item.cover && item.cover !== item.paths?.[0]) {
    removedFiles.push(item.cover);
  }
  if (item.pdfSourcePath) {
    removedFiles.push(item.pdfSourcePath);
  }
}

/** 注销账号时清理已同步的图解数据 */
function cleanupSyncedDiagramsForAccountDeletion(
  storage: Record<string, any>,
  removedFiles: string[],
) {
  const imageList = storage['imageList'] || [];
  const fileList = storage['fileList'] || [];

  for (const item of imageList) {
    if (item.syncStatus === 'synced') {
      removeDiagramFiles(item, removedFiles);
    }
  }
  for (const item of fileList) {
    if (item.syncStatus === 'synced') {
      removeDiagramFiles(item, removedFiles);
    }
  }

  const remainingImages = imageList
    .filter((i: any) => i.syncStatus === 'local')
    .map((i: any) => ({ ...i, syncStatus: 'local' }));
  const remainingFiles = fileList
    .filter((i: any) => i.syncStatus === 'local')
    .map((i: any) => ({ ...i, syncStatus: 'local' }));

  storage['imageList'] = remainingImages;
  storage['fileList'] = remainingFiles;
}

/** 退出登录时清理已同步的图解数据 */
function cleanupSyncedDiagrams(
  storage: Record<string, any>,
  removedFiles: string[],
) {
  const imageList = storage['imageList'] || [];
  const fileList = storage['fileList'] || [];
  const allItems = [...imageList, ...fileList];

  for (const item of allItems) {
    if (item.syncStatus === 'synced') {
      removeDiagramFiles(item, removedFiles);
    }
  }

  const remainingImages = imageList.filter((i: any) => i.syncStatus === 'local');
  const remainingFiles = fileList.filter((i: any) => i.syncStatus === 'local');
  storage['imageList'] = remainingImages;
  storage['fileList'] = remainingFiles;
}

/** 清除本地头像存储 */
function clearLocalAvatar(
  storage: Record<string, any>,
  deletedFiles: string[],
) {
  const localPath = storage['local_avatar_path'];
  if (localPath) {
    deletedFiles.push(localPath);
  }
  delete storage['local_avatar_path'];
  delete storage['local_avatar_file_id'];
}

// ========== 测试 ==========

describe('settings.ts 核心逻辑', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  // ===== removeDiagramFiles =====
  describe('removeDiagramFiles', () => {
    it('删除 paths 中的所有文件', () => {
      const item = { paths: ['/img/a.jpg', '/img/b.jpg'] };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual(['/img/a.jpg', '/img/b.jpg']);
    });

    it('删除 cover（与 paths[0] 不同时）', () => {
      const item = { paths: ['/img/a.jpg'], cover: '/img/cover.jpg' };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toContain('/img/a.jpg');
      expect(files).toContain('/img/cover.jpg');
    });

    it('不重复删除 cover（与 paths[0] 相同）', () => {
      const item = { paths: ['/img/a.jpg'], cover: '/img/a.jpg' };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual(['/img/a.jpg']);
    });

    it('删除 pdfSourcePath', () => {
      const item = { paths: [], pdfSourcePath: '/doc/source.pdf' };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual(['/doc/source.pdf']);
    });

    it('无文件时不报错', () => {
      const item = {};
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual([]);
    });

    it('paths 为空数组时不添加文件', () => {
      const item = { paths: [], cover: '/cover.jpg' };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual(['/cover.jpg']);
    });

    it('完整图解删除所有关联文件', () => {
      const item = {
        paths: ['/img/1.jpg', '/img/2.jpg'],
        cover: '/img/cover.jpg',
        pdfSourcePath: '/pdf/source.pdf',
      };
      const files: string[] = [];
      removeDiagramFiles(item, files);
      expect(files).toEqual(['/img/1.jpg', '/img/2.jpg', '/img/cover.jpg', '/pdf/source.pdf']);
    });
  });

  // ===== cleanupSyncedDiagramsForAccountDeletion =====
  describe('cleanupSyncedDiagramsForAccountDeletion', () => {
    it('删除 synced 项，保留 local 项', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/synced/a.jpg'] },
          { id: '2', syncStatus: 'local', paths: ['/local/b.jpg'] },
        ],
        fileList: [
          { id: '3', syncStatus: 'synced', paths: ['/synced/c.pdf'] },
        ],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagramsForAccountDeletion(storage, removedFiles);

      // synced 被删除
      expect(storage['imageList'].length).toBe(1);
      expect(storage['imageList'][0].id).toBe('2');
      expect(storage['fileList'].length).toBe(0);
      // 文件被收集
      expect(removedFiles).toContain('/synced/a.jpg');
      expect(removedFiles).toContain('/synced/c.pdf');
    });

    it('保留的 local 项 syncStatus 为 "local"', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'local', paths: [] },
          { id: '2', syncStatus: 'synced', paths: ['/a.jpg'] },
        ],
        fileList: [],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagramsForAccountDeletion(storage, removedFiles);

      expect(storage['imageList'][0].syncStatus).toBe('local');
    });

    it('空列表不报错', () => {
      const storage: Record<string, any> = {};
      const removedFiles: string[] = [];

      cleanupSyncedDiagramsForAccountDeletion(storage, removedFiles);

      expect(storage['imageList']).toEqual([]);
      expect(storage['fileList']).toEqual([]);
    });

    it('全部 synced → 清空列表', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/a.jpg'] },
          { id: '2', syncStatus: 'synced', paths: ['/b.jpg'] },
        ],
        fileList: [
          { id: '3', syncStatus: 'synced', paths: ['/c.pdf'] },
        ],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagramsForAccountDeletion(storage, removedFiles);

      expect(storage['imageList']).toEqual([]);
      expect(storage['fileList']).toEqual([]);
      expect(removedFiles.length).toBe(3);
    });

    it('全部 local → 保留全部', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'local', paths: [] },
          { id: '2', syncStatus: 'local', paths: [] },
        ],
        fileList: [{ id: '3', syncStatus: 'local', paths: [] }],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagramsForAccountDeletion(storage, removedFiles);

      expect(storage['imageList'].length).toBe(2);
      expect(storage['fileList'].length).toBe(1);
      expect(removedFiles.length).toBe(0);
    });
  });

  // ===== cleanupSyncedDiagrams（退出登录） =====
  describe('cleanupSyncedDiagrams', () => {
    it('删除 synced 项文件，保留 local 项', () => {
      const storage: Record<string, any> = {
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/sync/img.jpg'] },
          { id: '2', syncStatus: 'local', paths: ['/local/img.jpg'] },
        ],
        fileList: [
          { id: '3', syncStatus: 'synced', paths: ['/sync/doc.pdf'] },
          { id: '4', syncStatus: 'local', paths: ['/local/doc.pdf'] },
        ],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(storage['imageList'].length).toBe(1);
      expect(storage['imageList'][0].id).toBe('2');
      expect(storage['fileList'].length).toBe(1);
      expect(storage['fileList'][0].id).toBe('4');
      expect(removedFiles).toEqual(['/sync/img.jpg', '/sync/doc.pdf']);
    });

    it('local 项不重置 syncStatus（与注销不同）', () => {
      const storage: Record<string, any> = {
        imageList: [{ id: '1', syncStatus: 'local', paths: [] }],
        fileList: [],
      };
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(storage['imageList'][0].syncStatus).toBe('local');
    });

    it('空列表不报错', () => {
      const storage: Record<string, any> = {};
      const removedFiles: string[] = [];

      cleanupSyncedDiagrams(storage, removedFiles);

      expect(storage['imageList']).toEqual([]);
      expect(storage['fileList']).toEqual([]);
    });
  });

  // ===== clearLocalAvatar =====
  describe('clearLocalAvatar', () => {
    it('有路径时删除文件并清除 storage', () => {
      const storage: Record<string, any> = {
        local_avatar_path: '/usr/avatar.png',
        local_avatar_file_id: 'cloud://xxx',
      };
      const deletedFiles: string[] = [];

      clearLocalAvatar(storage, deletedFiles);

      expect(storage['local_avatar_path']).toBeUndefined();
      expect(storage['local_avatar_file_id']).toBeUndefined();
      expect(deletedFiles).toEqual(['/usr/avatar.png']);
    });

    it('无路径时只清除 storage keys', () => {
      const storage: Record<string, any> = {
        local_avatar_file_id: 'cloud://xxx',
      };
      const deletedFiles: string[] = [];

      clearLocalAvatar(storage, deletedFiles);

      expect(storage['local_avatar_file_id']).toBeUndefined();
      expect(deletedFiles).toEqual([]);
    });

    it('无任何头像数据时不报错', () => {
      const storage: Record<string, any> = {};
      const deletedFiles: string[] = [];

      clearLocalAvatar(storage, deletedFiles);

      expect(deletedFiles).toEqual([]);
    });
  });

  // ===== onDeleteAccount 流程 =====
  describe('onDeleteAccount 核心流程', () => {
    /** 模拟注销账号确认后的核心逻辑 */
    function executeDeleteAccount(
      storage: Record<string, any>,
      cloudResult: { success: boolean; error?: string },
      appMock: any,
      removedFiles: string[],
    ): { success: boolean; error?: string; storageCleared: boolean } {
      if (!cloudResult.success) {
        return { success: false, error: cloudResult.error, storageCleared: false };
      }

      // 清除账号相关缓存
      delete storage['userInfo'];
      delete storage['total_zhizhi_time'];

      // 清除本地头像
      clearLocalAvatar(storage, removedFiles);

      // 重置计数器
      if (appMock) {
        appMock.globalData.totalKnittingTime = 0;
        appMock.globalData.accountInvalidatedShown = true;
        appMock.resetLocalCountersToDefault();
      }

      return { success: true, storageCleared: true };
    }

    it('确认注销 → 成功 → 清除本地数据', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        total_zhizhi_time: 60000,
        local_avatar_path: '/avatar.png',
      };
      const appMock = {
        globalData: { totalKnittingTime: 60000, accountInvalidatedShown: false },
        resetLocalCountersToDefault: jest.fn(),
      };
      const removedFiles: string[] = [];

      const result = executeDeleteAccount(storage, { success: true }, appMock, removedFiles);

      expect(result.success).toBe(true);
      expect(result.storageCleared).toBe(true);
      expect(storage['userInfo']).toBeUndefined();
      expect(storage['total_zhizhi_time']).toBeUndefined();
      expect(appMock.globalData.totalKnittingTime).toBe(0);
      expect(appMock.globalData.accountInvalidatedShown).toBe(true);
      expect(appMock.resetLocalCountersToDefault).toHaveBeenCalled();
      expect(removedFiles).toContain('/avatar.png');
    });

    it('云函数失败 → 返回错误', () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
      };
      const removedFiles: string[] = [];

      const result = executeDeleteAccount(
        storage,
        { success: false, error: '注销失败' },
        null,
        removedFiles,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('注销失败');
      expect(result.storageCleared).toBe(false);
      // 未清除数据
      expect(storage['userInfo']).toBeDefined();
    });
  });

  // ===== onLogout 流程 =====
  describe('onLogout 核心流程', () => {
    /** 模拟退出登录确认后的核心逻辑 */
    async function executeLogout(
      storage: Record<string, any>,
      appMock: any,
      removedFiles: string[],
    ): Promise<{ synced: boolean; storageCleared: boolean }> {
      if (appMock) {
        appMock.pauseKnittingSession(false);

        await appMock.syncCounterData('upload').catch(() => {});
        await appMock.forceSyncTotalKnittingTime().catch(() => {});
      }

      // 清理已同步图解
      cleanupSyncedDiagrams(storage, removedFiles);

      // 清除登录状态
      const userInfo = storage['userInfo'] || {};
      userInfo.isLoggedIn = false;
      storage['userInfo'] = userInfo;

      // 清除总时长缓存
      delete storage['total_zhizhi_time'];
      if (appMock) {
        appMock.globalData.totalKnittingTime = 0;
        appMock.resetLocalCountersForLogout();
      }

      return { synced: true, storageCleared: true };
    }

    it('确认退出 → 同步 → 清理 → 重置', async () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true, nickName: 'test' },
        total_zhizhi_time: 120000,
        imageList: [
          { id: '1', syncStatus: 'synced', paths: ['/synced/a.jpg'] },
          { id: '2', syncStatus: 'local', paths: ['/local/b.jpg'] },
        ],
        fileList: [],
      };
      const appMock = {
        globalData: { totalKnittingTime: 120000 },
        pauseKnittingSession: jest.fn(),
        syncCounterData: jest.fn().mockResolvedValue(true),
        forceSyncTotalKnittingTime: jest.fn().mockResolvedValue(true),
        resetLocalCountersForLogout: jest.fn(),
      };
      const removedFiles: string[] = [];

      const result = await executeLogout(storage, appMock, removedFiles);

      expect(result.synced).toBe(true);
      expect(result.storageCleared).toBe(true);

      // 同步操作已调用
      expect(appMock.pauseKnittingSession).toHaveBeenCalledWith(false);
      expect(appMock.syncCounterData).toHaveBeenCalledWith('upload');
      expect(appMock.forceSyncTotalKnittingTime).toHaveBeenCalled();

      // 登录状态已清除
      expect(storage['userInfo'].isLoggedIn).toBe(false);
      expect(storage['total_zhizhi_time']).toBeUndefined();

      // 计时器已重置
      expect(appMock.globalData.totalKnittingTime).toBe(0);
      expect(appMock.resetLocalCountersForLogout).toHaveBeenCalled();

      // 图解已清理
      expect(storage['imageList'].length).toBe(1);
      expect(storage['imageList'][0].id).toBe('2');
      expect(removedFiles).toContain('/synced/a.jpg');
    });

    it('同步失败不影响退出流程', async () => {
      const storage: Record<string, any> = {
        userInfo: { isLoggedIn: true },
        total_zhizhi_time: 100,
        imageList: [],
        fileList: [],
      };
      const appMock = {
        globalData: { totalKnittingTime: 100 },
        pauseKnittingSession: jest.fn(),
        syncCounterData: jest.fn().mockRejectedValue(new Error('网络错误')),
        forceSyncTotalKnittingTime: jest.fn().mockRejectedValue(new Error('网络错误')),
        resetLocalCountersForLogout: jest.fn(),
      };
      const removedFiles: string[] = [];

      const result = await executeLogout(storage, appMock, removedFiles);

      // 即使同步失败，退出流程仍然完成
      expect(result.storageCleared).toBe(true);
      expect(storage['userInfo'].isLoggedIn).toBe(false);
      expect(appMock.resetLocalCountersForLogout).toHaveBeenCalled();
    });
  });
});
