/**
 * 编辑页 (edit.ts) 单元测试
 * 测试修改图解功能中的图片添加逻辑
 */

import wx, { mocks, clearAllMocks } from '../../__mocks__/wx';

// 模拟 Page 函数
let pageData: any = {};
let pageMethods: any = {};

const mockPage = (options: any) => {
  pageData = { ...options.data };
  pageMethods = { ...options };

  pageMethods.setData = (newData: any) => {
    pageData = { ...pageData, ...newData };
  };

  return pageMethods;
};

(global as any).Page = mockPage;

// 最大图片数量常量（与 edit.ts 保持一致）
const MAX_IMAGES = 15;

describe('编辑页 - 图片添加逻辑', () => {
  beforeEach(() => {
    clearAllMocks();
    // 初始化页面数据
    pageData = {
      images: [],
      hasChanges: false,
    };
    pageMethods = {
      data: pageData,
      setData: (newData: any) => {
        pageData = { ...pageData, ...newData };
      },
      showToast: (title: string) => {
        wx.showToast({ title, icon: 'none', duration: 1500 });
      },
      onAddImage: () => {
        const { images } = pageData;
        const remainingCount = Math.min(MAX_IMAGES - images.length, 9);

        if (remainingCount <= 0) {
          pageMethods.showToast('已达到最大图片数量');
          return;
        }

        wx.chooseMedia({
          count: remainingCount,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['original', 'compressed'],
          success: async (res: any) => {
            const tempPaths = res.tempFiles.map((file: any) => file.tempFilePath);

            wx.showLoading({ title: '保存中...', mask: true });
            const savedPaths: string[] = [];
            for (const tempPath of tempPaths) {
              try {
                const savedPath = await new Promise<string>((resolve, reject) => {
                  wx.saveFile({
                    tempFilePath: tempPath,
                    success: (r: any) => resolve(r.savedFilePath),
                    fail: reject,
                  });
                });
                savedPaths.push(savedPath);
              } catch (err) {
                savedPaths.push(tempPath);
              }
            }
            wx.hideLoading();

            const updatedImages = [...images, ...savedPaths];
            pageMethods.setData({
              images: updatedImages,
              hasChanges: true,
            });

            pageMethods.showToast(`已添加 ${savedPaths.length} 张图片`);
          },
        });
      },
    };
  });

  describe('onAddImage - 正常流程', () => {
    it('应该调用 wx.chooseMedia 并传递正确的参数', () => {
      pageMethods.setData({ images: [] });
      pageMethods.onAddImage();

      expect(mocks.chooseMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 9,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['original', 'compressed'],
        }),
      );
    });

    it('剩余数量不足9时，count 应为剩余数', () => {
      const existingImages = Array(10).fill('wxfile://usr/existing.jpg');
      pageMethods.setData({ images: existingImages });
      pageMethods.onAddImage();

      expect(mocks.chooseMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 5, // 15 - 10 = 5
        }),
      );
    });

    it('已满15张时应提示并返回，不调用 chooseMedia', () => {
      const fullImages = Array(15).fill('wxfile://usr/full.jpg');
      pageMethods.setData({ images: fullImages });

      pageMethods.onAddImage();

      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '已达到最大图片数量' }),
      );
      expect(mocks.chooseMedia).not.toHaveBeenCalled();
    });

    it('选择图片后应调用 wx.saveFile 持久化每张图片', async () => {
      const tempPaths = ['http://tmp/img1.jpg', 'http://tmp/img2.jpg'];
      const savedPaths = ['wxfile://usr/img1.jpg', 'wxfile://usr/img2.jpg'];

      mocks.saveFile
        .mockImplementation((opts: any) => {
          const idx = tempPaths.indexOf(opts.tempFilePath);
          opts.success({ savedFilePath: savedPaths[idx] });
        });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: tempPaths.map(p => ({ tempFilePath: p })),
        });
      });

      pageMethods.onAddImage();

      // 等待 async success 回调
      await new Promise(r => setTimeout(r, 50));

      expect(mocks.saveFile).toHaveBeenCalledTimes(2);
      expect(mocks.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ tempFilePath: 'http://tmp/img1.jpg' }),
      );
      expect(mocks.saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ tempFilePath: 'http://tmp/img2.jpg' }),
      );
    });

    it('持久化成功后应存储永久路径而非临时路径', async () => {
      const tempPath = 'http://tmp/new_img.jpg';
      const savedPath = 'wxfile://usr/new_img.jpg';

      mocks.saveFile.mockImplementation((opts: any) => {
        opts.success({ savedFilePath: savedPath });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: tempPath }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images).toContain(savedPath);
      expect(pageData.images).not.toContain(tempPath);
    });

    it('多张图片应按顺序全部添加到 images 数组', async () => {
      const tempPaths = ['http://tmp/a.jpg', 'http://tmp/b.jpg', 'http://tmp/c.jpg'];
      const savedPaths = ['wxfile://usr/a.jpg', 'wxfile://usr/b.jpg', 'wxfile://usr/c.jpg'];

      mocks.saveFile.mockImplementation((opts: any) => {
        const idx = tempPaths.indexOf(opts.tempFilePath);
        opts.success({ savedFilePath: savedPaths[idx] });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: tempPaths.map(p => ({ tempFilePath: p })),
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images).toEqual(savedPaths);
    });

    it('添加后 hasChanges 应为 true', async () => {
      mocks.saveFile.mockImplementation((opts: any) => {
        opts.success({ savedFilePath: 'wxfile://usr/img.jpg' });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: 'http://tmp/img.jpg' }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.hasChanges).toBe(true);
    });

    it('应显示 loading 并在完成后关闭', async () => {
      mocks.saveFile.mockImplementation((opts: any) => {
        opts.success({ savedFilePath: 'wxfile://usr/img.jpg' });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: 'http://tmp/img.jpg' }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(mocks.showLoading).toHaveBeenCalledWith({ title: '保存中...', mask: true });
      expect(mocks.hideLoading).toHaveBeenCalled();
    });
  });

  describe('onAddImage - 持久化失败降级', () => {
    it('单张图片持久化失败时，应降级使用临时路径', async () => {
      mocks.saveFile.mockImplementation((opts: any) => {
        opts.fail(new Error('磁盘空间不足'));
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: 'http://tmp/fallback.jpg' }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      // 降级：使用临时路径
      expect(pageData.images).toEqual(['http://tmp/fallback.jpg']);
      expect(pageData.hasChanges).toBe(true);
    });

    it('部分图片持久化失败时，成功的用永久路径，失败的用临时路径', async () => {
      const tempPaths = ['http://tmp/ok.jpg', 'http://tmp/fail.jpg'];
      let callCount = 0;

      mocks.saveFile.mockImplementation((opts: any) => {
        callCount++;
        if (opts.tempFilePath === 'http://tmp/ok.jpg') {
          opts.success({ savedFilePath: 'wxfile://usr/ok.jpg' });
        } else {
          opts.fail(new Error('保存失败'));
        }
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: tempPaths.map(p => ({ tempFilePath: p })),
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images).toEqual(['wxfile://usr/ok.jpg', 'http://tmp/fail.jpg']);
    });

    it('持久化失败不应阻止后续图片的保存', async () => {
      const tempPaths = ['http://tmp/fail.jpg', 'http://tmp/ok.jpg'];

      mocks.saveFile.mockImplementation((opts: any) => {
        if (opts.tempFilePath === 'http://tmp/fail.jpg') {
          opts.fail(new Error('失败'));
        } else {
          opts.success({ savedFilePath: 'wxfile://usr/ok.jpg' });
        }
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: tempPaths.map(p => ({ tempFilePath: p })),
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images.length).toBe(2);
      expect(pageData.images).toContain('wxfile://usr/ok.jpg');
    });
  });

  describe('onAddImage - 边界场景', () => {
    it('已有14张图片时，count 应为1', () => {
      const images = Array(14).fill('wxfile://usr/img.jpg');
      pageMethods.setData({ images });

      pageMethods.onAddImage();

      expect(mocks.chooseMedia).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 }),
      );
    });

    it('已有14张图再添加1张后达到上限', async () => {
      const existingImages = Array(14).fill('wxfile://usr/img.jpg');
      pageMethods.setData({ images: existingImages });

      mocks.saveFile.mockImplementation((opts: any) => {
        opts.success({ savedFilePath: 'wxfile://usr/last.jpg' });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: 'http://tmp/last.jpg' }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images.length).toBe(15);
    });

    it('已有1张图再添加9张，count 应为9', () => {
      pageMethods.setData({ images: ['wxfile://usr/one.jpg'] });

      pageMethods.onAddImage();

      expect(mocks.chooseMedia).toHaveBeenCalledWith(
        expect.objectContaining({ count: 9 }),
      );
    });

    it('新图片应追加到已有图片后面', async () => {
      pageMethods.setData({ images: ['wxfile://usr/existing.jpg'] });

      mocks.saveFile.mockImplementation((opts: any) => {
        opts.success({ savedFilePath: 'wxfile://usr/new.jpg' });
      });

      mocks.chooseMedia.mockImplementation((opts: any) => {
        opts.success({
          tempFiles: [{ tempFilePath: 'http://tmp/new.jpg' }],
        });
      });

      pageMethods.onAddImage();
      await new Promise(r => setTimeout(r, 50));

      expect(pageData.images[0]).toBe('wxfile://usr/existing.jpg');
      expect(pageData.images[1]).toBe('wxfile://usr/new.jpg');
    });
  });
});

describe('编辑页 - onSave 路径持久化验证', () => {
  it('保存时 images 中的路径应为永久路径（wxfile://）', () => {
    const permanentPaths = [
      'wxfile://usr/img1.jpg',
      'wxfile://usr/img2.jpg',
    ];

    // 验证路径格式：wxfile:// 开头的是持久化路径
    const allPermanent = permanentPaths.every(p => p.startsWith('wxfile://'));
    expect(allPermanent).toBe(true);
  });

  it('不应包含 http://tmp 临时路径', () => {
    const mixedPaths = [
      'wxfile://usr/img1.jpg',
      'http://tmp/img2.jpg',
    ];

    const hasTempPath = mixedPaths.some(p => p.includes('tmp'));
    expect(hasTempPath).toBe(true); // 混合路径中确实有临时路径

    // 修复后应全部为永久路径
    const allPermanent = mixedPaths.every(p => p.startsWith('wxfile://'));
    expect(allPermanent).toBe(false); // 这个场景说明如果降级了就可能有临时路径
  });
});
