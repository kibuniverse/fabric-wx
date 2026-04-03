// deleteUser 云函数单元测试

const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockRemove = jest.fn();
const mockDeleteFile = jest.fn();

jest.mock('wx-server-sdk', () => {
  const mockUsersCollection = jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
  }));

  const mockDiagramsCollection = jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
  }));

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: 'test-openid' })),
    database: jest.fn(() => ({
      collection: function(name) {
        if (name === 'users') {
          return mockUsersCollection();
        }
        if (name === 'diagrams') {
          return mockDiagramsCollection();
        }
        return { where: mockWhere };
      },
    })),
    deleteFile: mockDeleteFile,
  };
});

const handler = require('../index.js');

describe('deleteUser 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet });
    mockDoc.mockReturnValue({ remove: mockRemove });
  });

  describe('成功注销', () => {
    it('应该删除用户和云存储头像', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: 'cloud://avatar.jpg',
      };

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockDeleteFile.mockResolvedValue({ fileList: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(result.message).toBe('账号已注销');
      expect(mockDeleteFile).toHaveBeenCalledWith({ fileList: ['cloud://avatar.jpg'] });
      expect(mockRemove).toHaveBeenCalled();
    });

    it('应该删除用户的所有图解', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: '',
      };

      const diagrams = [
        {
          _id: 'd1',
          openid: 'test-openid',
          cover: 'cloud://cover1.jpg',
          images: ['cloud://page1.jpg'],
        },
        {
          _id: 'd2',
          openid: 'test-openid',
          cover: 'cloud://cover2.jpg',
          images: [],
        },
      ];

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: diagrams });
      mockDeleteFile.mockResolvedValue({ fileList: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledWith({
        fileList: ['cloud://cover1.jpg', 'cloud://page1.jpg', 'cloud://cover2.jpg'],
      });
      expect(mockRemove).toHaveBeenCalled();
    });

    it('本地头像不应该调用 deleteFile', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: '/local/avatar.jpg',
      };

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('无头像时不应该调用 deleteFile', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: '',
      };

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
    });
  });

  describe('兼容旧数据', () => {
    it('用 openid 查询失败后应该尝试 _openid', async () => {
      const user = {
        _id: 'user-1',
        _openid: 'test-openid',
        avatarUrl: '',
      };

      mockGet.mockResolvedValueOnce({ data: [] });
      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(mockGet).toHaveBeenCalledTimes(3);
    });
  });

  describe('用户不存在', () => {
    it('应该返回错误', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('用户不存在');
    });
  });

  describe('错误处理', () => {
    it('删除云文件失败应该继续注销', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: 'cloud://avatar.jpg',
      };

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockDeleteFile.mockRejectedValue(new Error('delete failed'));
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(mockRemove).toHaveBeenCalled();
    });

    it('删除图解失败应该继续注销用户', async () => {
      const user = {
        _id: 'user-1',
        openid: 'test-openid',
        avatarUrl: '',
      };

      mockGet.mockResolvedValueOnce({ data: [user] });
      mockGet.mockRejectedValueOnce(new Error('diagrams query failed'));
      mockRemove.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
    });

    it('数据库错误应该返回错误信息', async () => {
      mockGet.mockRejectedValue(new Error('数据库连接失败'));

      const result = await handler.main({}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库连接失败');
    });
  });
});