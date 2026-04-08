/**
 * 计数器组件 (counter/index.ts) 历史记录高亮逻辑单元测试
 * 测试：新记录的 highlight 字段计算、旧数据迁移回填
 */

describe('计数器组件 - 历史记录高亮', () => {
  /**
   * 模拟 addHistory 中的 highlight 计算逻辑
   * 奇数序号的记录高亮（第1条、第3条…），基于创建顺序
   */
  function calculateHighlight(currentHistoryLength: number): boolean {
    // currentHistory.length 是插入前的长度
    // 插入后新记录的序号 = currentHistoryLength + 1（第1条序号为1）
    return currentHistoryLength % 2 === 0;
  }

  /**
   * 模拟加载旧数据时的 highlight 回填逻辑
   * 数组按最新在前排列，创建序号 = totalItems - i
   */
  function backfillHighlight(history: any[]): any[] {
    const totalItems = history.length;
    return history.map((item, i) => {
      if (item.highlight === undefined) {
        return {
          ...item,
          highlight: (totalItems - i) % 2 === 1,
        };
      }
      return item;
    });
  }

  describe('calculateHighlight - 新增记录的高亮计算', () => {
    it('第1条记录（序号1）应高亮', () => {
      expect(calculateHighlight(0)).toBe(true);
    });

    it('第2条记录（序号2）不应高亮', () => {
      expect(calculateHighlight(1)).toBe(false);
    });

    it('第3条记录（序号3）应高亮', () => {
      expect(calculateHighlight(2)).toBe(true);
    });

    it('第4条记录（序号4）不应高亮', () => {
      expect(calculateHighlight(3)).toBe(false);
    });

    it('第5条记录（序号5）应高亮', () => {
      expect(calculateHighlight(4)).toBe(true);
    });

    it('奇数序号全部高亮', () => {
      for (let i = 0; i < 20; i++) {
        const seq = i + 1;
        expect(calculateHighlight(i)).toBe(seq % 2 === 1);
      }
    });
  });

  describe('backfillHighlight - 旧数据迁移', () => {
    it('3条旧数据应正确回填 highlight', () => {
      const history = [
        { id: 3, action: 'add', count: 3 }, // 最新，序号3
        { id: 2, action: 'add', count: 2 }, // 序号2
        { id: 1, action: 'add', count: 1 }, // 最旧，序号1
      ];

      const result = backfillHighlight(history);
      expect(result[0].highlight).toBe(true);  // 序号3，奇数
      expect(result[1].highlight).toBe(false); // 序号2，偶数
      expect(result[2].highlight).toBe(true);  // 序号1，奇数
    });

    it('4条旧数据应正确回填', () => {
      const history = [
        { id: 4, action: 'add', count: 4 }, // 序号4
        { id: 3, action: 'add', count: 3 }, // 序号3
        { id: 2, action: 'add', count: 2 }, // 序号2
        { id: 1, action: 'add', count: 1 }, // 序号1
      ];

      const result = backfillHighlight(history);
      expect(result[0].highlight).toBe(false); // 序号4
      expect(result[1].highlight).toBe(true);  // 序号3
      expect(result[2].highlight).toBe(false); // 序号2
      expect(result[3].highlight).toBe(true);  // 序号1
    });

    it('空数组应返回空数组', () => {
      expect(backfillHighlight([])).toEqual([]);
    });

    it('单条数据应高亮（序号1）', () => {
      const history = [{ id: 1, action: 'add', count: 1 }];
      const result = backfillHighlight(history);
      expect(result[0].highlight).toBe(true);
    });

    it('已有 highlight 的记录不应被覆盖', () => {
      const history = [
        { id: 1, action: 'add', count: 1, highlight: false },
      ];
      const result = backfillHighlight(history);
      expect(result[0].highlight).toBe(false); // 保持原值
    });

    it('混合数据：仅回填缺失 highlight 的记录', () => {
      const history = [
        { id: 3, action: 'add', count: 3, highlight: true },  // 已有，保留
        { id: 2, action: 'add', count: 2 },                     // 缺失，回填
        { id: 1, action: 'add', count: 1, highlight: false },  // 已有，保留
      ];

      const result = backfillHighlight(history);
      expect(result[0].highlight).toBe(true);  // 保留原值
      expect(result[1].highlight).toBe(false); // 序号2，回填
      expect(result[2].highlight).toBe(false); // 保留原值
    });
  });

  describe('高亮逻辑端到端验证', () => {
    it('模拟连续添加5条记录的高亮序列', () => {
      // 按 unshift 方式（最新在前），记录每次插入前 history 长度
      const history: any[] = [];
      const highlights: boolean[] = [];

      for (let i = 1; i <= 5; i++) {
        const hl = calculateHighlight(history.length);
        highlights.push(hl);
        history.unshift({
          id: i,
          action: 'add',
          count: i,
          highlight: hl,
        });
      }

      // 按创建顺序：序号1→true, 2→false, 3→true, 4→false, 5→true
      expect(highlights).toEqual([true, false, true, false, true]);
      // history[0] 是第5条（最后创建），highlight=true
      expect(history[0].highlight).toBe(true);
    });

    it('5条记录的高亮应为 true/false 交替', () => {
      // 按创建顺序记录
      const highlights: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        highlights.push(calculateHighlight(i));
      }

      // 序号 1:true, 2:false, 3:true, 4:false, 5:true
      expect(highlights).toEqual([true, false, true, false, true]);
    });

    it('20条记录的高亮规律', () => {
      const highlights: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        highlights.push(calculateHighlight(i));
      }

      // 奇数序号为 true，偶数序号为 false
      for (let i = 0; i < 20; i++) {
        const seq = i + 1;
        expect(highlights[i]).toBe(seq % 2 === 1);
      }
    });
  });

  describe('高亮与旧数据迁移一致性', () => {
    it('新创建的5条记录，迁移后应一致', () => {
      // 模拟创建5条记录（无 highlight 字段，模拟旧数据）
      const oldHistory = [
        { id: 5, action: 'add', count: 5 },
        { id: 4, action: 'add', count: 4 },
        { id: 3, action: 'add', count: 3 },
        { id: 2, action: 'add', count: 2 },
        { id: 1, action: 'add', count: 1 },
      ];

      // 回填
      const backfilled = backfillHighlight(oldHistory);

      // 与新建时的计算对比
      const expectedHighlights = [true, false, true, false, true];
      // 序号：5→true, 4→false, 3→true, 2→false, 1→true
      for (let i = 0; i < 5; i++) {
        expect(backfilled[i].highlight).toBe(expectedHighlights[i]);
      }
    });
  });
});
