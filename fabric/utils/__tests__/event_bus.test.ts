// event_bus.ts 单元测试

import { eventBus } from '../event_bus';

describe('MiniEventBus', () => {
  beforeEach(() => {
    // 清除所有监听器
    eventBus.off('refreshCounter');
    eventBus.off('onMemoContentChange');
    eventBus.off('counterButtonClicked');
  });

  describe('订阅和触发事件', () => {
    it('应该能够订阅和触发 refreshCounter 事件', () => {
      const callback = jest.fn();
      eventBus.on('refreshCounter', callback);

      eventBus.emit('refreshCounter', { counterKey: 'test_counter' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ counterKey: 'test_counter' });
    });

    it('应该能够订阅和触发 onMemoContentChange 事件', () => {
      const callback = jest.fn();
      eventBus.on('onMemoContentChange', callback);

      eventBus.emit('onMemoContentChange', undefined);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应该能够订阅和触发 counterButtonClicked 事件', () => {
      const callback = jest.fn();
      eventBus.on('counterButtonClicked', callback);

      const payload = {
        type: 'increase' as 'increase' | 'decrease',
        numberPosition: { x: 100, y: 200 }
      };
      eventBus.emit('counterButtonClicked', payload);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(payload);
    });

    it('counterKey="all" 应该正确传递', () => {
      const callback = jest.fn();
      eventBus.on('refreshCounter', callback);

      eventBus.emit('refreshCounter', { counterKey: 'all' });

      expect(callback).toHaveBeenCalledWith({ counterKey: 'all' });
    });
  });

  describe('多个监听器', () => {
    it('同一事件应该支持多个监听器', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('refreshCounter', callback1);
      eventBus.on('refreshCounter', callback2);

      eventBus.emit('refreshCounter', { counterKey: 'test' });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('触发事件时应该按顺序调用所有监听器', () => {
      const order: number[] = [];
      const callback1 = jest.fn(() => order.push(1));
      const callback2 = jest.fn(() => order.push(2));
      const callback3 = jest.fn(() => order.push(3));

      eventBus.on('refreshCounter', callback1);
      eventBus.on('refreshCounter', callback2);
      eventBus.on('refreshCounter', callback3);

      eventBus.emit('refreshCounter', { counterKey: 'test' });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('取消订阅', () => {
    it('off(fn) 应该移除特定监听器', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('refreshCounter', callback1);
      eventBus.on('refreshCounter', callback2);

      eventBus.off('refreshCounter', callback1);
      eventBus.emit('refreshCounter', { counterKey: 'test' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('off() 不传 fn 应该清空该事件全部回调', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      eventBus.on('refreshCounter', callback1);
      eventBus.on('refreshCounter', callback2);

      eventBus.off('refreshCounter');
      eventBus.emit('refreshCounter', { counterKey: 'test' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('移除不存在的监听器应该安全处理', () => {
      const callback = jest.fn();
      eventBus.on('refreshCounter', callback);

      // 移除一个未注册的函数
      eventBus.off('refreshCounter', jest.fn());
      eventBus.emit('refreshCounter', { counterKey: 'test' });

      // 原监听器应该仍然工作
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('取消未订阅的事件应该安全处理', () => {
      // 不应该抛错
      eventBus.off('refreshCounter', jest.fn());
      eventBus.off('onMemoContentChange');
    });
  });

  describe('边界情况', () => {
    it('触发没有监听器的事件应该安全处理', () => {
      // 不应该抛错
      eventBus.emit('refreshCounter', { counterKey: 'test' });
    });

    it('监听器中抛出错误会影响其他监听器', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('test error');
      });
      const normalCallback = jest.fn();

      eventBus.on('refreshCounter', errorCallback);
      eventBus.on('refreshCounter', normalCallback);

      // 由于 forEach 不会捕获错误，这会抛出
      expect(() => {
        eventBus.emit('refreshCounter', { counterKey: 'test' });
      }).toThrow('test error');
    });
  });
});