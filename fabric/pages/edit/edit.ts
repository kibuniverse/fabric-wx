// pages/edit/edit.ts
export {}

// 最大图片数量
const MAX_IMAGES = 15;

// 长按触发时间（毫秒）
const LONG_PRESS_DURATION = 500;

// 移动阈值（像素），超过此值取消长按检测
const MOVE_THRESHOLD = 10;

// 提示条存储键
const TIP_DISMISSED_KEY = "editTipDismissed";

// 同步时间戳存储键（与 home.ts 保持一致）
const STORAGE_KEYS = {
  LAST_SYNC_TIME: "lastDiagramSyncTime",
};

// 通用的提示配置
const TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

interface EditPageData {
  itemId: string;
  itemName: string;
  images: string[];           // 图片路径数组
  originalImages: string[];   // 原始图片路径（用于检测修改）
  hasChanges: boolean;        // 是否有未保存修改

  // 云端同步相关
  syncStatus: 'local' | 'synced' | '';  // 同步状态
  cloudImages: string[];                 // 云端图片 fileID 数组
  originalCloudImages: string[];         // 原始云端图片（用于检测变化）

  // 拖动相关
  isDragging: boolean;        // 是否处于拖动状态
  dragIndex: number;          // 当前拖动图片索引
  dragOverIndex: number;      // 拖动悬停位置的索引
  deleteZoneActive: boolean;  // 删除区域是否激活
  dragX: number;              // 浮层X坐标
  dragY: number;              // 浮层Y坐标
  touchStartX: number;        // 触摸起始X
  touchStartY: number;        // 触摸起始Y
  touchStartTime: number;      // 触摸开始时间

  // 确认对话框
  showDeleteConfirm: boolean; // 显示删除确认框
  pendingDeleteIndex: number; // 待删除的图片索引
  showExitConfirm: boolean;   // 显示退出确认框

  // 系统信息
  statusBarHeight: number;     // 状态栏高度
  windowWidth: number;
  windowHeight: number;
  deleteZoneTop: number;      // 删除区域顶部位置
  gridItemWidth: number;      // 网格项宽度
  gridItemHeight: number;     // 网格项高度
  navBarHeight: number;       // 导航栏高度（状态栏+内容区）
  gridPaddingTop: number;     // 网格顶部padding（动态计算）
  showTip: boolean;           // 是否显示提示条

  // 对话框按钮配置
  deleteButtons: { text: string; value: number; type?: string }[];
  exitButtons: { text: string; value: number; type?: string }[];
}

// 长按定时器（页面临时变量）
let longPressTimer: number | null = null;

Page<EditPageData, WechatMiniprogram.IAnyObject>({
  data: {
    itemId: "",
    itemName: "",
    images: [],
    originalImages: [],
    hasChanges: false,

    // 云端同步相关
    syncStatus: '',
    cloudImages: [],
    originalCloudImages: [],

    isDragging: false,
    dragIndex: -1,
    dragOverIndex: -1,
    deleteZoneActive: false,
    dragX: 0,
    dragY: 0,
    touchStartX: 0,
    touchStartY: 0,
    touchStartTime: 0,

    showDeleteConfirm: false,
    pendingDeleteIndex: -1,
    showExitConfirm: false,

    statusBarHeight: 44,
    windowWidth: 375,
    windowHeight: 667,
    deleteZoneTop: 0,
    gridItemWidth: 0,
    gridItemHeight: 0,
    navBarHeight: 0,
    gridPaddingTop: 0,
    showTip: false,

    deleteButtons: [
      { text: '取消', value: 0 },
      { text: '删除', value: 1, type: 'warn' }
    ],
    exitButtons: [
      { text: '继续编辑', value: 0 },
      { text: '放弃', value: 1, type: 'warn' }
    ],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options: Record<string, string>) {
    // 获取系统信息
    const systemInfo = wx.getWindowInfo();
    const windowWidth = systemInfo.windowWidth;
    const statusBarHeight = systemInfo.statusBarHeight || 44;

    // rpx 转换比例
    const rpx = windowWidth / 750;

    // 网格项宽度：(窗口宽度 - 左右padding 50*2 - 间距 20*2) / 3
    // 即 (windowWidth - 100 - 40) / 3 = (windowWidth - 140) / 3
    const gridItemWidth = (windowWidth - 140 * rpx) / 3;
    const gridItemHeight = gridItemWidth; // 正方形

    // 计算导航栏高度（状态栏 + 内容区44px）
    const navBarHeight = statusBarHeight + 44;

    // 计算网格顶部padding：导航栏高度 + 60rpx间距
    const gridPaddingTop = navBarHeight + 60 * rpx;

    // 检查是否已关闭提示
    const tipDismissed = wx.getStorageSync(TIP_DISMISSED_KEY);

    this.setData({
      statusBarHeight,
      windowWidth,
      windowHeight: systemInfo.windowHeight,
      deleteZoneTop: systemInfo.windowHeight - 200 * rpx, // 删除区域高度200rpx
      gridItemWidth,
      gridItemHeight,
      navBarHeight,
      gridPaddingTop,
      showTip: !tipDismissed,
    });

    // 接收传递的图解ID参数
    if (options.id) {
      this.setData({ itemId: options.id });
      this.loadItemDetail(options.id);
    } else {
      this.showToast("参数错误");
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 加载图解详情
   */
  loadItemDetail(id: string) {
    const imageList = wx.getStorageSync("imageList") || [];
    const item = imageList.find((item: any) => item.id === id);

    if (item) {
      const itemPaths = item.paths || [item.path];
      const cloudImages = item.cloudImages || [];
      const syncStatus = item.syncStatus || 'local';

      this.setData({
        itemName: item.name,
        images: [...itemPaths],
        originalImages: [...itemPaths],
        cloudImages: [...cloudImages],
        originalCloudImages: [...cloudImages],
        syncStatus,
      });
    } else {
      this.showToast("未找到图解");
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 点击图片预览
   */
  onPreview(e: WechatMiniprogram.TouchEvent) {
    // 如果正在拖动，不预览
    if (this.data.isDragging) return;

    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images,
    });
  },

  /**
   * 触摸开始 - 手动长按检测
   */
  onTouchStart(e: WechatMiniprogram.TouchEvent) {
    if (this.data.isDragging) return;

    const index = e.currentTarget.dataset.index;
    const touch = e.touches[0];

    // 记录起始位置和时间
    this.setData({
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
      touchStartTime: Date.now(),
    });

    // 启动长按定时器
    longPressTimer = setTimeout(() => {
      this.startDrag(index, touch.clientX, touch.clientY);
    }, LONG_PRESS_DURATION) as unknown as number;
  },

  /**
   * 触摸移动
   */
  onTouchMove(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];

    // 未触发拖动时，检测是否滑动超过阈值
    if (!this.data.isDragging && longPressTimer !== null) {
      const dx = touch.clientX - this.data.touchStartX;
      const dy = touch.clientY - this.data.touchStartY;

      // 移动超过阈值则取消长按检测
      if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      return;
    }

    // 已在拖动状态，更新位置
    if (this.data.isDragging) {
      // 阻止页面滚动
      (e as any).preventDefault && (e as any).preventDefault();
      this.updateDragPosition(touch);
    }
  },

  /**
   * 触摸结束
   */
  onTouchEnd(e: WechatMiniprogram.TouchEvent) {
    // 清除长按定时器
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // 结束拖动
    if (this.data.isDragging) {
      this.endDrag();
      return;
    }

    // 检测单击：触摸时长 < 300ms 且移动距离 < 10px
    const touchDuration = Date.now() - this.data.touchStartTime;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - this.data.touchStartX);
    const dy = Math.abs(touch.clientY - this.data.touchStartY);

    if (touchDuration < 300 && dx < MOVE_THRESHOLD && dy < MOVE_THRESHOLD) {
      // 单击，打开预览
      this.onPreview(e);
    }
  },

  /**
   * 触摸取消（如来电打断）
   */
  onTouchCancel() {
    // 清除长按定时器
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // 结束拖动
    if (this.data.isDragging) {
      this.endDrag();
    }
  },

  /**
   * 开始拖动
   */
  startDrag(index: number, x: number, y: number) {
    // 震动反馈
    wx.vibrateShort({ type: "medium" });

    const { gridItemWidth, gridItemHeight } = this.data;

    this.setData({
      isDragging: true,
      dragIndex: index,
      dragOverIndex: index,
      dragX: x - gridItemWidth / 2,
      dragY: y - gridItemHeight / 2,
    });
  },

  /**
   * 更新拖动位置（实时重排）
   */
  updateDragPosition(touch: WechatMiniprogram.Touch & { clientX: number; clientY: number }) {
    const { deleteZoneTop, images, dragIndex, gridItemWidth, gridItemHeight } = this.data;

    // 更新浮层位置
    const dragX = touch.clientX - gridItemWidth / 2;
    const dragY = touch.clientY - gridItemHeight / 2;

    // 检查是否在删除区域内
    if (touch.clientY > deleteZoneTop) {
      if (!this.data.deleteZoneActive) {
        this.setData({ deleteZoneActive: true });
      }
      this.setData({ dragX, dragY });
      return;
    } else {
      if (this.data.deleteZoneActive) {
        this.setData({ deleteZoneActive: false });
      }
    }

    // 计算目标索引
    const targetIndex = this.calculateTargetIndex(touch.clientX, touch.clientY);

    // 实时重排
    if (targetIndex !== -1 && targetIndex !== dragIndex) {
      const newImages = [...images];
      const [removed] = newImages.splice(dragIndex, 1);
      newImages.splice(targetIndex, 0, removed);

      this.setData({
        images: newImages,
        dragIndex: targetIndex, // 更新当前拖动索引
        dragOverIndex: targetIndex,
        dragX,
        dragY,
        hasChanges: true,
      });
    } else {
      this.setData({ dragX, dragY });
    }
  },

  /**
   * 计算目标索引
   */
  calculateTargetIndex(clientX: number, clientY: number): number {
    const { windowWidth, images, gridItemWidth, gridPaddingTop, deleteZoneTop } = this.data;

    // 如果已进入或接近删除区域，不进行重排计算
    if (clientY >= deleteZoneTop - 50) {
      return -1;
    }

    // 计算网格位置
    // 网格区域 padding: 左右50rpx，顶部由 gridPaddingTop 动态计算
    // 图片间距: 20rpx
    const rpx = windowWidth / 750;
    const gridPaddingLeft = 50 * rpx;
    const itemGap = 20 * rpx; // 图片间距
    const itemSize = gridItemWidth; // 正方形

    // 计算列（每行3列）
    const relativeX = clientX - gridPaddingLeft;
    const col = Math.floor(relativeX / (itemSize + itemGap));
    const clampedCol = Math.max(0, Math.min(col, 2));

    // 计算行
    const relativeY = clientY - gridPaddingTop;
    const row = Math.floor(relativeY / (itemSize + itemGap));
    const clampedRow = Math.max(0, row);

    // 计算索引
    let index = clampedRow * 3 + clampedCol;

    // 边界检查：不能超过图片数量
    // 占位图位置自动后移，所以最大索引是 images.length - 1
    index = Math.max(0, Math.min(index, images.length - 1));

    return index;
  },

  /**
   * 结束拖动
   */
  endDrag() {
    const { deleteZoneActive, dragIndex } = this.data;

    // 如果在删除区域释放
    if (deleteZoneActive) {
      this.setData({
        isDragging: false,
        dragIndex: -1,
        dragOverIndex: -1,
        deleteZoneActive: false,
        showDeleteConfirm: true,
        pendingDeleteIndex: dragIndex,
      });
      return;
    }

    // 立即结束拖动状态
    this.setData({
      isDragging: false,
      dragIndex: -1,
      dragOverIndex: -1,
    });
  },

  /**
   * 点击占位图添加图片
   */
  onAddImage() {
    const { images } = this.data;
    const remainingCount = Math.min(MAX_IMAGES - images.length, 9);

    if (remainingCount <= 0) {
      this.showToast("已达到最大图片数量");
      return;
    }

    wx.chooseMedia({
      count: remainingCount,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["original", "compressed"],
      success: (res) => {
        const newPaths = res.tempFiles.map((file) => file.tempFilePath);
        const updatedImages = [...images, ...newPaths];

        this.setData({
          images: updatedImages,
          hasChanges: true,
        });

        this.showToast(`已添加 ${newPaths.length} 张图片`);
      },
    });
  },

  /**
   * 确认删除图片
   */
  confirmDeleteImage(e: WechatMiniprogram.CustomEvent) {
    const index = e.detail.index;

    if (index === 0) {
      // 点击取消按钮
      this.closeDeleteConfirm();
      return;
    }

    // 点击删除按钮
    const { pendingDeleteIndex, images } = this.data;

    if (pendingDeleteIndex < 0 || pendingDeleteIndex >= images.length) {
      this.closeDeleteConfirm();
      return;
    }

    const newImages = [...images];
    newImages.splice(pendingDeleteIndex, 1);

    this.setData({
      images: newImages,
      hasChanges: true,
      showDeleteConfirm: false,
      pendingDeleteIndex: -1,
    });

    this.showToast("已删除");
  },

  /**
   * 关闭删除确认框
   */
  closeDeleteConfirm() {
    this.setData({
      showDeleteConfirm: false,
      pendingDeleteIndex: -1,
    });
  },

  /**
   * 保存修改
   */
  async onSave() {
    const { itemId, images, syncStatus, originalImages, originalCloudImages } = this.data;

    console.log('[edit onSave] 开始保存', {
      itemId,
      syncStatus,
      imagesCount: images.length,
      originalImagesCount: originalImages.length,
      originalCloudImagesCount: originalCloudImages.length,
    });

    if (images.length === 0) {
      this.showToast("至少保留一张图片");
      return;
    }

    wx.showLoading({ title: '保存中...' });

    // 1. 更新本地存储
    const imageList = wx.getStorageSync("imageList") || [];
    const index = imageList.findIndex((item: any) => item.id === itemId);

    // 判断封面是否为自动设置（等于原来的某张图片），用于决定是否跟随首图更新
    const isAutoCover = index !== -1 && (!imageList[index].cover || originalImages.includes(imageList[index].cover));

    if (index !== -1) {
      imageList[index].paths = images;
      imageList[index].path = images[0]; // 兼容旧版本
      // 自动封面跟随新的首图
      if (isAutoCover) {
        imageList[index].cover = images[0];
      }
      wx.setStorageSync("imageList", imageList);
      console.log('[edit onSave] 本地存储已更新');
    }

    // 2. 如果已同步到云端，进行云端同步
    console.log('[edit onSave] 检查是否需要云端同步:', { syncStatus, index });
    if (syncStatus === 'synced' && index !== -1) {
      console.log('[edit onSave] 进入云端同步流程');
      try {
        // 构建本地路径 → 云端ID 的映射表
        const localToCloud = new Map<string, string>();
        for (let i = 0; i < originalImages.length; i++) {
          if (originalCloudImages[i]) {
            localToCloud.set(originalImages[i], originalCloudImages[i]);
          }
        }
        console.log('[edit onSave] 映射表构建完成:', {
          mapSize: localToCloud.size,
          mappings: Array.from(localToCloud.entries()).map(([local, cloud]) => ({
            local: local.substring(local.lastIndexOf('/') + 1),
            cloud: cloud.substring(cloud.lastIndexOf('/') + 1),
          })),
        });

        // 找出需要删除的云端图片（原序中有，现序中无）
        const deletedCloudIds = originalCloudImages.filter((id, i) =>
          id && !images.includes(originalImages[i])
        );
        console.log('[edit onSave] 需删除的云端图片:', deletedCloudIds.length);

        // 删除云端图片
        if (deletedCloudIds.length > 0) {
          console.log('[edit onSave] 正在删除云端图片:', deletedCloudIds);
          try {
            await wx.cloud.deleteFile({ fileList: deletedCloudIds });
            console.log('[edit onSave] 云端图片删除成功');
          } catch (e) {
            console.warn('[edit onSave] 删除云端图片失败:', e);
          }
        }

        // 上传新增图片并更新映射
        let newUploadCount = 0;
        console.log('[edit onSave] 检查新增图片, images:', images.map(p => p.substring(p.lastIndexOf('/') + 1)));
        console.log('[edit onSave] localToCloud keys:', Array.from(localToCloud.keys()).map(p => p.substring(p.lastIndexOf('/') + 1)));
        for (const localPath of images) {
          const isInMap = localToCloud.has(localPath);
          console.log('[edit onSave] 检查图片:', localPath.substring(localPath.lastIndexOf('/') + 1), '是否在映射表中:', isInMap);
          if (!isInMap) {
            const cloudPath = `diagrams/${itemId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            console.log('[edit onSave] 开始上传新增图片:', localPath.substring(localPath.lastIndexOf('/') + 1), '→', cloudPath);
            try {
              const uploadResult = await wx.cloud.uploadFile({ cloudPath, filePath: localPath });
              console.log('[edit onSave] 上传结果:', uploadResult);
              if (uploadResult.fileID) {
                localToCloud.set(localPath, uploadResult.fileID);
                newUploadCount++;
                console.log('[edit onSave] 上传成功, fileID:', uploadResult.fileID);
              } else {
                console.warn('[edit onSave] 上传返回无 fileID:', uploadResult);
              }
            } catch (e) {
              console.warn('[edit onSave] 上传新增图片失败:', localPath, e);
            }
          }
        }
        console.log('[edit onSave] 新上传图片数量:', newUploadCount);

        // 按当前顺序生成云端图片数组
        const finalCloudImages = images.map(p => localToCloud.get(p) || '');
        console.log('[edit onSave] 最终云端图片数组:', {
          length: finalCloudImages.length,
          images: finalCloudImages.map(id => id.substring(id.lastIndexOf('/') + 1)),
        });

        // 更新本地 cloudImages
        imageList[index].cloudImages = finalCloudImages;
        wx.setStorageSync("imageList", imageList);
        console.log('[edit onSave] 本地 cloudImages 已更新');

        // 调用云函数更新
        const callFunctionParams: Record<string, any> = {
          action: 'updateInfo',
          diagramId: itemId,
          images: finalCloudImages,
        };
        // 只有自动封面才跟随首图更新，自定义封面保持不变
        if (isAutoCover) {
          callFunctionParams.cover = finalCloudImages[0] || '';
        }
        console.log('[edit onSave] 调用云函数参数:', JSON.stringify(callFunctionParams, null, 2));
        const cloudResult = await wx.cloud.callFunction({
          name: 'syncDiagramData',
          data: callFunctionParams,
        });
        console.log('[edit onSave] 云函数返回:', JSON.stringify(cloudResult.result, null, 2));

        // 使用服务器返回的时间戳，避免客户端时间与服务器时间不一致
        const result = cloudResult.result as any;
        if (result && result.updatedAt) {
          wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, result.updatedAt);
          console.log('[edit onSave] 已保存服务器时间戳:', result.updatedAt);
        } else {
          wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
          console.log('[edit onSave] 云函数未返回时间戳，使用本地时间');
        }
        console.log('[edit onSave] 云端同步完成');
      } catch (err) {
        console.error('[edit onSave] 云端同步失败:', err);
        wx.hideLoading();
        wx.showToast({ title: '云同步失败，已保存本地', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
    } else {
      console.log('[edit onSave] 未进入云端同步:', syncStatus !== 'synced' ? 'syncStatus不是synced' : 'index为-1');
    }

    wx.hideLoading();
    this.showToast("保存成功");
    setTimeout(() => wx.navigateBack(), 500);
  },

  /**
   * 取消修改
   */
  onCancel() {
    if (this.data.hasChanges) {
      this.setData({ showExitConfirm: true });
    } else {
      wx.navigateBack();
    }
  },

  /**
   * 确认放弃修改
   */
  confirmExit(e: WechatMiniprogram.CustomEvent) {
    const index = e.detail.index;

    if (index === 0) {
      // 点击继续编辑
      this.setData({ showExitConfirm: false });
      return;
    }

    // 点击放弃
    this.setData({ showExitConfirm: false });
    wx.navigateBack();
  },

  /**
   * 显示提示信息
   */
  showToast(title: string) {
    wx.showToast({
      title,
      ...TOAST_CONFIG,
    });
  },

  /**
   * 关闭提示条
   */
  dismissTip() {
    this.setData({ showTip: false });
    wx.setStorageSync(TIP_DISMISSED_KEY, true);
  },

  /**
   * 页面返回拦截
   */
  onUnload() {
    // 清理定时器
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/home/home',
      imageUrl: '/assets/share.png'
    }
  },
});