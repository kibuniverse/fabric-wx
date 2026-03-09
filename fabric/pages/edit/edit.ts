// pages/edit/edit.ts

// 最大图片数量
const MAX_IMAGES = 15;

// 长按触发时间（毫秒）
const LONG_PRESS_DURATION = 500;

// 移动阈值（像素），超过此值取消长按检测
const MOVE_THRESHOLD = 10;

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
  windowWidth: number;
  windowHeight: number;
  deleteZoneTop: number;      // 删除区域顶部位置
  gridItemWidth: number;      // 网格项宽度
  gridItemHeight: number;     // 网格项高度
  navBarHeight: number;       // 导航栏高度

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

    windowWidth: 375,
    windowHeight: 667,
    deleteZoneTop: 0,
    gridItemWidth: 0,
    gridItemHeight: 0,
    navBarHeight: 0,

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
    // 网格项宽度：(窗口宽度 - 左右padding 20*2 - 项间距 10*2*3) / 3
    // 即 (windowWidth - 40 - 60) / 3 = (windowWidth - 100) / 3
    // 实际使用 calc(33.33% - 20rpx)，按rpx计算
    // 1rpx = windowWidth / 750
    const rpx = windowWidth / 750;
    const gridItemWidth = windowWidth / 3 - 20 * rpx; // 33.33% - 20rpx margin
    const gridItemHeight = 200 * rpx; // 200rpx height

    // 计算导航栏高度（包含安全区域）
    const navBarHeight = 88; // 自定义导航栏高度

    this.setData({
      windowWidth,
      windowHeight: systemInfo.windowHeight,
      deleteZoneTop: systemInfo.windowHeight - 120, // 删除区域高度约120px
      gridItemWidth,
      gridItemHeight,
      navBarHeight,
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
      this.setData({
        itemName: item.name,
        images: [...itemPaths],
        originalImages: [...itemPaths],
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
      e.preventDefault && e.preventDefault();
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
  updateDragPosition(touch: WechatMiniprogram.Touch) {
    const { windowWidth, deleteZoneTop, images, dragIndex, gridItemWidth, gridItemHeight, navBarHeight } = this.data;

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
    const { windowWidth, images, navBarHeight, gridItemWidth, gridItemHeight } = this.data;

    // 计算网格位置
    // 考虑网格的 padding 和 margin
    const rpx = windowWidth / 750;
    const gridPadding = 20 * rpx; // 网格区域的 padding
    const itemMargin = 10 * rpx;  // 每个项的 margin

    // 计算列（每行3列）
    const col = Math.floor(clientX / (windowWidth / 3));
    const clampedCol = Math.max(0, Math.min(col, 2));

    // 计算行
    const row = Math.floor((clientY - navBarHeight - gridPadding) / (gridItemHeight + itemMargin * 2));
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
    const { deleteZoneActive, dragIndex, images } = this.data;

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
  onSave() {
    const { itemId, images } = this.data;

    if (images.length === 0) {
      this.showToast("至少保留一张图片");
      return;
    }

    // 更新本地存储
    const imageList = wx.getStorageSync("imageList") || [];
    const index = imageList.findIndex((item: any) => item.id === itemId);

    if (index !== -1) {
      imageList[index].paths = images;
      imageList[index].path = images[0]; // 兼容旧版本
      wx.setStorageSync("imageList", imageList);
    }

    this.showToast("保存成功");

    setTimeout(() => {
      wx.navigateBack();
    }, 500);
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
   * 取消退出（已废弃，合并到 confirmExit）
   */
  cancelExit() {
    this.setData({ showExitConfirm: false });
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
   * 页面返回拦截
   */
  onUnload() {
    // 清理定时器
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  },
});