// syncDiagramData 云函数单元测试

const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockCount = jest.fn();
const mockDeleteFile = jest.fn();

jest.mock('wx-server-sdk', () => {
  const mockCollection = jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
    add: mockAdd,
    orderBy: mockOrderBy,
  }));

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: 'test-openid' })),
    database: jest.fn(() => ({
      collection: mockCollection,
      serverDate: jest.fn(() => 'mock-server-date'),
    })),
    deleteFile: mockDeleteFile,
  };
});

const handler = require('../index.js');

describe('syncDiagramData 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({
      get: mockGet,
      orderBy: mockOrderBy,
      count: mockCount,
    });
    mockOrderBy.mockReturnValue({
      get: mockGet,
      limit: mockLimit,
    });
    mockLimit.mockReturnValue({ get: mockGet });
    mockDoc.mockReturnValue({ update: mockUpdate, remove: mockRemove });
  });

  describe('upload 模式', () => {
    it('应该成功上传新图解', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });
      mockAdd.mockResolvedValue({ _id: 'new-diagram-id' });

      const diagram = {
        id: 'diagram-123',
        name: '测试图解',
        originalName: 'original.pdf',
        type: 'pdf',
        createTime: Date.now(),
        cover: 'cloud://cover.jpg',
        images: ['cloud://page1.jpg', 'cloud://page2.jpg'],
        size: 1024,
      };

      const result = await handler.main({ action: 'upload', diagram }, {});

      expect(result.success).toBe(true);
      expect(result.data.cloudId).toBe('new-diagram-id');
      expect(mockAdd).toHaveBeenCalled();
    });

    it('应该更新已存在的图解', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'existing-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});

      const diagram = {
        id: 'diagram-123',
        name: '更新后的图解',
        originalName: 'updated.pdf',
        type: 'pdf',
        createTime: Date.now(),
        cover: 'cloud://new-cover.jpg',
        images: [],
        size: 2048,
      };

      const result = await handler.main({ action: 'upload', diagram }, {});

      expect(result.success).toBe(true);
      expect(result.data.cloudId).toBe('existing-id');
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('图解数据不完整时应该返回错误', async () => {
      const result = await handler.main({
        action: 'upload',
        diagram: { name: '不完整的图解' },
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('图解数据不完整');
    });

    it('缺少 diagram 参数时应该返回错误', async () => {
      const result = await handler.main({ action: 'upload' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('图解数据不完整');
    });

    it('上传新图解时应包含 lastAccessTime', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });
      mockAdd.mockResolvedValue({ _id: 'new-id' });

      const diagram = {
        id: 'diagram-456',
        name: '带排序的图解',
        originalName: 'test.jpg',
        type: 'image',
        createTime: 1000,
        cover: 'cloud://cover.jpg',
        images: ['cloud://img1.jpg'],
        lastAccessTime: 2000,
      };

      const result = await handler.main({ action: 'upload', diagram }, {});

      expect(result.success).toBe(true);
      const addCall = mockAdd.mock.calls[0][0];
      expect(addCall.data.lastAccessTime).toBe(2000);
    });

    it('更新已有图解时应包含 lastAccessTime', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'existing-id', id: 'diagram-456' }],
      });
      mockUpdate.mockResolvedValue({});

      const diagram = {
        id: 'diagram-456',
        name: '更新排序',
        originalName: 'test.jpg',
        type: 'image',
        createTime: 1000,
        cover: 'cloud://cover.jpg',
        images: [],
        lastAccessTime: 3000,
      };

      const result = await handler.main({ action: 'upload', diagram }, {});

      expect(result.success).toBe(true);
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.lastAccessTime).toBe(3000);
    });

    it('无 lastAccessTime 时不应写入该字段', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });
      mockAdd.mockResolvedValue({ _id: 'new-id' });

      const diagram = {
        id: 'diagram-789',
        name: '无排序字段',
        originalName: 'test.jpg',
        type: 'image',
        createTime: 1000,
        cover: '',
        images: [],
      };

      await handler.main({ action: 'upload', diagram }, {});

      const addCall = mockAdd.mock.calls[0][0];
      expect(addCall.data).not.toHaveProperty('lastAccessTime');
    });
  });

  describe('download 模式', () => {
    it('应该返回所有图解列表', async () => {
      const diagrams = [
        { _id: '1', id: 'd1', name: '图解1', createTime: 100 },
        { _id: '2', id: 'd2', name: '图解2', createTime: 200 },
      ];

      mockGet.mockResolvedValue({ data: diagrams });

      const result = await handler.main({ action: 'download' }, {});

      expect(result.success).toBe(true);
      expect(result.data.diagrams).toEqual(diagrams);
    });

    it('无图解时应该返回空数组', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({ action: 'download' }, {});

      expect(result.success).toBe(true);
      expect(result.data.diagrams).toEqual([]);
    });
  });

  describe('delete 模式', () => {
    it('应该成功删除图解及其云文件', async () => {
      const diagramToDelete = {
        _id: 'diagram-doc-id',
        openid: 'test-openid',
        id: 'diagram-123',
        cover: 'cloud://cover.jpg',
        images: ['cloud://page1.jpg', 'cloud://page2.jpg'],
      };

      mockGet.mockResolvedValue({ data: [diagramToDelete] });
      mockDeleteFile.mockResolvedValue({ fileList: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({
        action: 'delete',
        diagramId: 'diagram-123',
      }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('图解已删除');
      expect(mockDeleteFile).toHaveBeenCalledWith({
        fileList: ['cloud://cover.jpg', 'cloud://page1.jpg', 'cloud://page2.jpg'],
      });
      expect(mockRemove).toHaveBeenCalled();
    });

    it('删除不存在的图解应该返回错误', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({
        action: 'delete',
        diagramId: 'non-existent',
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('图解不存在');
    });

    it('缺少 diagramId 参数应该返回错误', async () => {
      const result = await handler.main({ action: 'delete' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('图解ID不能为空');
    });

    it('删除非云存储封面时不应该调用 deleteFile', async () => {
      const diagramToDelete = {
        _id: 'diagram-doc-id',
        openid: 'test-openid',
        id: 'diagram-123',
        cover: '/local/path/cover.jpg',
        images: [],
      };

      mockGet.mockResolvedValue({ data: [diagramToDelete] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({
        action: 'delete',
        diagramId: 'diagram-123',
      }, {});

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });
  });

  describe('count 模式', () => {
    it('应该返回图解数量', async () => {
      mockCount.mockResolvedValue({ total: 5 });

      const result = await handler.main({ action: 'count' }, {});

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
    });

    it('无图解时数量应该为 0', async () => {
      mockCount.mockResolvedValue({ total: 0 });

      const result = await handler.main({ action: 'count' }, {});

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
    });
  });

  describe('checkUpdate 模式（跨设备同步检查）', () => {
    it('云端有更新时应该返回 hasUpdate=true 和 diagramCount', async () => {
      const cloudUpdateTime = 1704172800000;
      mockGet.mockResolvedValue({
        data: [{ _id: '1', updatedAt: new Date(cloudUpdateTime) }],
      });
      mockCount.mockResolvedValue({ total: 3 });

      const lastSyncTime = 1704086400000;

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime,
        localDiagramCount: 3,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(true);
      expect(result.data.cloudUpdateTime).toBe(cloudUpdateTime);
      expect(result.data.diagramCount).toBe(3);
    });

    it('云端无更新且数量相同时应该返回 hasUpdate=false', async () => {
      const cloudUpdateTime = 1704086400000;
      mockGet.mockResolvedValue({
        data: [{ _id: '1', updatedAt: new Date(cloudUpdateTime) }],
      });
      mockCount.mockResolvedValue({ total: 3 });

      const lastSyncTime = 1704172800000;

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime,
        localDiagramCount: 3,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(false);
      expect(result.data.diagramCount).toBe(3);
    });

    it('云端数量变化（删除检测）应返回 hasUpdate=true', async () => {
      // 云端时间戳比本地旧，但数量不同 => 有删除
      const cloudUpdateTime = 1704086400000;
      mockGet.mockResolvedValue({
        data: [{ _id: '1', updatedAt: new Date(cloudUpdateTime) }],
      });
      mockCount.mockResolvedValue({ total: 2 });  // 云端2个

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime: 1704172800000,  // 比云端新
        localDiagramCount: 3,  // 本地记录3个
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(true);  // 数量变化触发同步
      expect(result.data.diagramCount).toBe(2);
    });

    it('云端无图解但本地有已同步图解（全部被删除）', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime: 1704086400000,
        localDiagramCount: 2,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(true);  // 本地有但云端无 => 需要同步
      expect(result.data.diagramCount).toBe(0);
    });

    it('云端无图解本地也无图解时返回 hasUpdate=false', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime: 0,
        localDiagramCount: 0,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(false);
      expect(result.data.diagramCount).toBe(0);
    });

    it('未传 localDiagramCount 时仅按时间戳判断', async () => {
      const cloudUpdateTime = 1704172800000;
      mockGet.mockResolvedValue({
        data: [{ _id: '1', updatedAt: new Date(cloudUpdateTime) }],
      });
      mockCount.mockResolvedValue({ total: 3 });

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime: 0,
        // 不传 localDiagramCount
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(true);  // 时间戳判断
      expect(result.data.diagramCount).toBe(3);
    });

    it('图解无 updatedAt 字段时应返回 cloudUpdateTime=0', async () => {
      mockGet.mockResolvedValue({
        data: [{ _id: '1' }], // 无 updatedAt
      });
      mockCount.mockResolvedValue({ total: 1 });

      const result = await handler.main({
        action: 'checkUpdate',
        lastSyncTime: 100,
        localDiagramCount: 1,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.cloudUpdateTime).toBe(0);
    });
  });

  describe('sync 模式（跨设备数据同步）', () => {
    it('应该返回所有云端图解和最新更新时间', async () => {
      const diagrams = [
        { _id: '1', id: 'd1', name: '图解1', updatedAt: new Date(100) },
        { _id: '2', id: 'd2', name: '图解2', updatedAt: new Date(200) },
      ];

      mockGet.mockResolvedValue({ data: diagrams });

      const result = await handler.main({ action: 'sync' }, {});

      expect(result.success).toBe(true);
      expect(result.data.diagrams).toEqual(diagrams);
      expect(result.data.cloudUpdateTime).toBe(200); // 取最大的 updatedAt
      expect(result.data.hasUpdate).toBe(true);
    });

    it('云端无图解时应该返回空数组', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({ action: 'sync' }, {});

      expect(result.success).toBe(true);
      expect(result.data.diagrams).toEqual([]);
      expect(result.data.cloudUpdateTime).toBe(0);
    });

    it('应该取最大的 updatedAt 作为 cloudUpdateTime', async () => {
      const diagrams = [
        { _id: '1', updatedAt: new Date(300) },
        { _id: '2', updatedAt: new Date(500) },
        { _id: '3', updatedAt: new Date(200) },
      ];

      mockGet.mockResolvedValue({ data: diagrams });

      const result = await handler.main({ action: 'sync' }, {});

      expect(result.data.cloudUpdateTime).toBe(500);
    });
  });

  describe('updateInfo 模式', () => {
    it('应该成功更新图片顺序和封面', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});
      // 第二次 mockGet 用于查询更新后的数据
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', id: 'diagram-123', updatedAt: new Date(1704172800000) }],
      });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'diagram-123',
        images: ['cloud://img1.jpg', 'cloud://img2.jpg', 'cloud://img3.jpg'],
      }, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('图解信息已更新');
      expect(mockUpdate).toHaveBeenCalledWith({
        data: {
          updatedAt: 'mock-server-date',
          images: ['cloud://img1.jpg', 'cloud://img2.jpg', 'cloud://img3.jpg'],
          cover: 'cloud://img1.jpg',  // 自动使用第一张作为封面
        }
      });
    });

    it('应该成功更新图片顺序并保留原有封面', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', id: 'diagram-123', updatedAt: new Date(1704172800000) }],
      });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'diagram-123',
        images: ['cloud://img2.jpg', 'cloud://img1.jpg'],
        cover: 'cloud://custom-cover.jpg',  // 显式指定封面
      }, {});

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        data: {
          updatedAt: 'mock-server-date',
          images: ['cloud://img2.jpg', 'cloud://img1.jpg'],
          cover: 'cloud://custom-cover.jpg',  // 使用显式指定的封面
        }
      });
    });

    it('空图片数组不应该更新封面', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', id: 'diagram-123', updatedAt: new Date(1704172800000) }],
      });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'diagram-123',
        images: [],
      }, {});

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        data: {
          updatedAt: 'mock-server-date',
          images: [],
          // 没有 cover 字段，因为数组为空
        }
      });
    });

    it('图解不存在时应该返回错误', async () => {
      mockGet.mockResolvedValueOnce({ data: [] });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'non-existent',
        images: ['cloud://img1.jpg'],
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('图解不存在');
    });

    it('应该支持更新 lastAccessTime', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', id: 'diagram-123', updatedAt: new Date(1704172800000) }],
      });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'diagram-123',
        lastAccessTime: 1704172800000,
      }, {});

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        data: {
          updatedAt: 'mock-server-date',
          lastAccessTime: 1704172800000,
        }
      });
    });

    it('同时更新名称和 lastAccessTime', async () => {
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', openid: 'test-openid', id: 'diagram-123' }],
      });
      mockUpdate.mockResolvedValue({});
      mockGet.mockResolvedValueOnce({
        data: [{ _id: 'doc-id', id: 'diagram-123', updatedAt: new Date(1704172800000) }],
      });

      const result = await handler.main({
        action: 'updateInfo',
        diagramId: 'diagram-123',
        name: '新名称',
        lastAccessTime: 5000,
      }, {});

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        data: {
          updatedAt: 'mock-server-date',
          name: '新名称',
          lastAccessTime: 5000,
        }
      });
    });
  });

  describe('无效操作类型', () => {
    it('应该返回错误', async () => {
      const result = await handler.main({ action: 'invalid' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('无效的操作类型');
    });
  });

  describe('错误处理', () => {
    it('数据库错误应该返回错误信息', async () => {
      mockGet.mockRejectedValue(new Error('数据库连接失败'));

      const result = await handler.main({ action: 'download' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库连接失败');
    });
  });
});
