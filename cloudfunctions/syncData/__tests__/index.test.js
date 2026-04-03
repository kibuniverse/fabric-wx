// syncData 云函数单元测试 - 知织号修改逻辑

const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();

jest.mock('wx-server-sdk', () => {
  const mockCollection = jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
  }));

  return {
    init: jest.fn(),
    DYNAMIC_CURRENT_ENV: 'test-env',
    getWXContext: jest.fn(() => ({ OPENID: 'test-openid' })),
    database: jest.fn(() => ({
      collection: mockCollection,
      serverDate: jest.fn(() => 'mock-server-date'),
    })),
  };
});

const handler = require('../index.js');

describe('syncData 云函数 - 知织号修改', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet });
    mockDoc.mockReturnValue({ update: mockUpdate });
  });

  describe('知织号唯一性检查', () => {
    it('知织号未被占用时应该成功修改', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
        nickName: '测试用户',
        totalKnittingTime: 1000,
      };

      // 第一次查询返回当前用户
      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      // 第二次查询检查知织号是否被占用（返回空数组，表示未被占用）
      mockGet.mockResolvedValueOnce({ data: [] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        zhizhiId: 'newZhizhiId',
        zhizhiIdModified: true,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('newZhizhiId');
      expect(result.data.zhizhiIdModified).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('知织号已被其他用户占用时应该返回错误', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
        nickName: '测试用户',
      };

      // 第一次查询返回当前用户
      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      // 第二次查询检查知织号是否被占用（返回其他用户，表示已被占用）
      mockGet.mockResolvedValueOnce({ data: [{ _id: 'user-2', zhizhiId: 'duplicateId' }] });

      const result = await handler.main({
        zhizhiId: 'duplicateId',
        zhizhiIdModified: true,
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('该知织ID已被使用');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('知织号被当前用户自己占用（相同ID）不应该触发检查', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: 'myZhizhiId',
        zhizhiIdModified: false,
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        zhizhiId: 'myZhizhiId', // 与当前用户相同
        zhizhiIdModified: false,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('myZhizhiId');
      // 因为知织号相同，不触发更新逻辑，所以只调用一次 get（查询用户）
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('知织号修改限制', () => {
    it('用户已修改过知织号时不能再次修改', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: 'alreadyModified',
        zhizhiIdModified: true, // 已修改过
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        zhizhiId: 'anotherId',
        zhizhiIdModified: true,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('alreadyModified'); // 保持原知织号
      expect(result.data.zhizhiIdModified).toBe(true);
      // 不触发知织号检查，只调用一次 get
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('未传入知织号时不应该触发更新逻辑', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        nickName: '新昵称',
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('123456789');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('用户不存在', () => {
    it('用户不存在时应该返回错误', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({
        zhizhiId: 'newId',
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('用户不存在，请先登录');
    });
  });

  describe('兼容旧数据查询', () => {
    it('用 openid 查询失败后应该尝试 _openid', async () => {
      const existingUser = {
        _id: 'user-1',
        _openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
      };

      // 第一次 openid 查询失败
      mockGet.mockResolvedValueOnce({ data: [] });
      // 第二次 _openid 查询成功
      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      // 第三次知织号唯一性检查（未被占用）
      mockGet.mockResolvedValueOnce({ data: [] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        zhizhiId: 'newId',
        zhizhiIdModified: true,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('newId');
      expect(mockGet).toHaveBeenCalledTimes(3);
    });
  });

  describe('其他数据同步', () => {
    it('应该能同时更新知织号和昵称', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
        nickName: '旧昵称',
        avatarUrl: 'https://old-avatar.jpg',
        totalKnittingTime: 1000,
      };

      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      mockGet.mockResolvedValueOnce({ data: [] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        zhizhiId: 'newZhizhiId',
        zhizhiIdModified: true,
        nickName: '新昵称',
        avatarUrl: 'https://new-avatar.jpg',
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBe('newZhizhiId');
      expect(result.data.zhizhiIdModified).toBe(true);
      expect(result.data.nickName).toBe('新昵称');
      expect(result.data.avatarUrl).toBe('https://new-avatar.jpg');
    });

    it('累加针织总时长', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        totalKnittingTime: 1000,
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        totalKnittingTime: 500,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.totalKnittingTime).toBe(1500);
    });
  });

  describe('错误处理', () => {
    it('数据库查询错误应该返回错误信息', async () => {
      mockGet.mockRejectedValue(new Error('数据库连接失败'));

      const result = await handler.main({
        zhizhiId: 'newId',
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库连接失败');
    });

    it('知织号检查时数据库错误应该返回错误', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: false,
      };

      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      mockGet.mockRejectedValueOnce(new Error('知织号检查失败'));

      const result = await handler.main({
        zhizhiId: 'newId',
        zhizhiIdModified: true,
      }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('知织号检查失败');
    });
  });
});