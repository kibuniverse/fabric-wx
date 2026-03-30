// syncCounterData 云函数单元测试
// 运行方式: 在 cloudfunctions/syncCounterData 目录下执行 npm test

// Mock wx-server-sdk
const mockServerDate = jest.fn(() => 'mock-server-date');
const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockCollection = jest.fn(() => ({
  where: mockWhere,
  doc: mockDoc,
  add: mockAdd,
}));

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test-env',
  getWXContext: jest.fn(() => ({ OPENID: 'test-openid' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: mockServerDate,
  })),
}));

// 加载被测试的云函数
const handler = require('../index.js');

describe('syncCounterData 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet });
    mockDoc.mockReturnValue({ update: mockUpdate });
  });

  describe('用户不存在的情况', () => {
    it('应该返回错误', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await handler.main({ action: 'upload', counterKeys: [], counters: {} }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('用户不存在');
    });
  });

  describe('upload 模式', () => {
    it('应该上传本地数据到云端', async () => {
      const mockUser = { _id: 'user-1', openid: 'test-openid' };
      mockGet.mockResolvedValue({ data: [mockUser] });
      mockUpdate.mockResolvedValue({});

      const counterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const counters = {
        counter_1: { name: '计数器1', currentCount: 10, updatedAt: Date.now() },
      };

      const result = await handler.main({
        action: 'upload',
        counterKeys,
        counters,
      }, {});

      expect(result.success).toBe(true);
      expect(result.data.counterKeys).toEqual(counterKeys);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('download 模式', () => {
    it('应该返回云端数据', async () => {
      const counterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const counters = { counter_1: { name: '计数器1' } };

      mockGet.mockResolvedValue({
        data: [{ _id: 'user-1', openid: 'test-openid', counterKeys, counters }],
      });

      const result = await handler.main({ action: 'download' }, {});

      expect(result.success).toBe(true);
      expect(result.data.counterKeys).toEqual(counterKeys);
      expect(result.data.counters).toEqual(counters);
    });

    it('云端无数据时应该返回空数组', async () => {
      mockGet.mockResolvedValue({
        data: [{ _id: 'user-1', openid: 'test-openid' }],
      });

      const result = await handler.main({ action: 'download' }, {});

      expect(result.success).toBe(true);
      expect(result.data.counterKeys).toEqual([]);
      expect(result.data.counters).toEqual({});
    });
  });

  describe('sync 模式', () => {
    it('应该合并本地和云端数据', async () => {
      const cloudCounterKeys = [{ key: 'counter_1', title: '云端计数器' }];
      const cloudCounters = {
        counter_1: { name: '云端计数器', currentCount: 5, updatedAt: 1000 },
      };
      const localCounterKeys = [{ key: 'counter_2', title: '本地计数器' }];
      const localCounters = {
        counter_2: { name: '本地计数器', currentCount: 10, updatedAt: 2000 },
      };

      mockGet.mockResolvedValue({
        data: [{
          _id: 'user-1',
          openid: 'test-openid',
          counterKeys: cloudCounterKeys,
          counters: cloudCounters,
        }],
      });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        action: 'sync',
        counterKeys: localCounterKeys,
        counters: localCounters,
      }, {});

      expect(result.success).toBe(true);
      // 应该包含两个计数器
      expect(result.data.counterKeys.length).toBe(2);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('本地数据更新时应该保留本地数据', async () => {
      const now = Date.now();
      const cloudCounterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const cloudCounters = {
        counter_1: { name: '云端计数器', currentCount: 5, updatedAt: now - 1000 },
      };
      const localCounterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const localCounters = {
        counter_1: { name: '本地计数器', currentCount: 10, updatedAt: now },
      };

      mockGet.mockResolvedValue({
        data: [{
          _id: 'user-1',
          openid: 'test-openid',
          counterKeys: cloudCounterKeys,
          counters: cloudCounters,
        }],
      });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        action: 'sync',
        counterKeys: localCounterKeys,
        counters: localCounters,
      }, {});

      expect(result.success).toBe(true);
      // 本地数据更新时间更晚，应该保留本地数据
      expect(result.data.counters.counter_1.currentCount).toBe(10);
    });

    it('云端数据更新时应该保留云端数据', async () => {
      const now = Date.now();
      const cloudCounterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const cloudCounters = {
        counter_1: { name: '云端计数器', currentCount: 20, updatedAt: now },
      };
      const localCounterKeys = [{ key: 'counter_1', title: '计数器1' }];
      const localCounters = {
        counter_1: { name: '本地计数器', currentCount: 10, updatedAt: now - 1000 },
      };

      mockGet.mockResolvedValue({
        data: [{
          _id: 'user-1',
          openid: 'test-openid',
          counterKeys: cloudCounterKeys,
          counters: cloudCounters,
        }],
      });
      mockUpdate.mockResolvedValue({});

      const result = await handler.main({
        action: 'sync',
        counterKeys: localCounterKeys,
        counters: localCounters,
      }, {});

      expect(result.success).toBe(true);
      // 云端数据更新时间更晚，应该保留云端数据
      expect(result.data.counters.counter_1.currentCount).toBe(20);
    });
  });

  describe('无效操作类型', () => {
    it('应该返回错误', async () => {
      mockGet.mockResolvedValue({
        data: [{ _id: 'user-1', openid: 'test-openid' }],
      });

      const result = await handler.main({ action: 'invalid' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('无效的操作类型');
    });
  });
});