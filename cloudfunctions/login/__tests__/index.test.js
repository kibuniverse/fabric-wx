// login 云函数单元测试

const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockCount = jest.fn();

jest.mock('wx-server-sdk', () => {
  const mockCollection = jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
    add: mockAdd,
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

describe('login 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet, count: mockCount });
    mockDoc.mockReturnValue({ update: mockUpdate });
  });

  describe('已存在用户登录', () => {
    it('应该返回用户数据', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        zhizhiIdModified: true,
        nickName: '测试用户',
        avatarUrl: 'https://avatar.jpg',
        totalKnittingTime: 1000,
        counterKeys: ['counter_1'],
        counters: { counter_1: { name: '计数器1' } },
      };

      mockGet.mockResolvedValue({ data: [existingUser] });

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(false);
      expect(result.data.zhizhiId).toBe('123456789');
      expect(result.data.zhizhiIdModified).toBe(true);
    });

    it('传入昵称和头像应该更新用户信息', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        zhizhiId: '123456789',
        nickName: '旧昵称',
        avatarUrl: 'https://old-avatar.jpg',
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        nickName: '新昵称',
        avatarUrl: 'https://new-avatar.jpg',
      }, {});

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(false);
      expect(result.data.nickName).toBe('新昵称');
      expect(result.data.avatarUrl).toBe('https://new-avatar.jpg');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('只传入昵称应该只更新昵称', async () => {
      const existingUser = {
        _id: 'user-1',
        openid: 'test-openid',
        nickName: '旧昵称',
        avatarUrl: 'https://avatar.jpg',
      };

      mockGet.mockResolvedValue({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({ nickName: '新昵称' }, {});

      expect(result.success).toBe(true);
      expect(result.data.nickName).toBe('新昵称');
      expect(result.data.avatarUrl).toBe('https://avatar.jpg');
    });
  });

  describe('兼容旧数据查询', () => {
    it('用 openid 查询失败后应该尝试 _openid', async () => {
      const existingUser = {
        _id: 'user-1',
        _openid: 'test-openid',
        zhizhiId: '123456789',
      };

      mockGet.mockResolvedValueOnce({ data: [] });
      mockGet.mockResolvedValueOnce({ data: [existingUser] });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(false);
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('新用户注册', () => {
    it('应该创建新用户并生成知织ID', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({
        nickName: '新用户',
        avatarUrl: 'https://avatar.jpg',
      }, {});

      expect(result.success).toBe(true);
      expect(result.isNewUser).toBe(true);
      expect(result.data.zhizhiId).toBeDefined();
      expect(result.data.zhizhiId.length).toBe(9);
      expect(result.data.nickName).toBe('新用户');
      expect(result.data.totalKnittingTime).toBe(0);
      expect(result.data.counterKeys.length).toBe(1);
      expect(result.data.counters).toBeDefined();
    });

    it('新用户应该初始化默认计数器', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({}, {});

      expect(result.data.counterKeys).toBeDefined();
      expect(result.data.counterKeys.length).toBeGreaterThan(0);

      const firstCounterKey = result.data.counterKeys[0];
      const firstCounter = result.data.counters[firstCounterKey];

      expect(firstCounter.name).toBeDefined();
      expect(firstCounter.targetCount).toBeDefined();
      expect(firstCounter.currentCount).toBe(0);
      expect(firstCounter.history).toEqual([]);
      expect(firstCounter.memo).toBe('');
    });

    it('无昵称应该使用默认值', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({}, {});

      expect(result.data.nickName).toBe('微信用户');
    });

    it('知织ID重复时应该重新生成', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValueOnce({ total: 1 });
      mockCount.mockResolvedValueOnce({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({}, {});

      expect(result.success).toBe(true);
      expect(result.data.zhizhiId).toBeDefined();
      expect(mockCount).toHaveBeenCalledTimes(2);
    });
  });

  describe('知织ID生成', () => {
    it('生成的知织ID应该是9位数字', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({}, {});

      const zhizhiId = result.data.zhizhiId;
      expect(zhizhiId).toMatch(/^\d{9}$/);
    });

    it('新用户 zhizhiIdModified 应该为 false', async () => {
      mockGet.mockResolvedValue({ data: [] });
      mockCount.mockResolvedValue({ total: 0 });
      mockAdd.mockResolvedValue({ _id: 'new-user-id' });

      const result = await handler.main({}, {});

      expect(result.data.zhizhiIdModified).toBe(false);
    });
  });

  describe('错误处理', () => {
    it('数据库错误应该返回错误信息', async () => {
      mockGet.mockRejectedValue(new Error('数据库连接失败'));

      const result = await handler.main({}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库连接失败');
    });

    it('未知错误应该返回默认错误信息', async () => {
      mockGet.mockRejectedValue({});

      const result = await handler.main({}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('登录失败');
    });
  });
});