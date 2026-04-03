// syncDiagramData 云函数单元测试

const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockOrderBy = jest.fn();
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
    mockOrderBy.mockReturnValue({ get: mockGet });
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