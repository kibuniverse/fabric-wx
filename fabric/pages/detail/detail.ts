// pages/detail/detail.ts

// 备忘录存储键
const MEMO_STORAGE_KEY = "itemMemos";
// 计数器存储键（与 simple-counter 组件保持一致）
const COUNTERS_STORAGE_KEY = "simpleCounters";
// 图片索引存储键
const LAST_IMAGE_INDEX_KEY = "lastImageIndex";

// 定义详情页面需要的接口
interface DetailPageData {
  itemId: string;
  itemType: "image" | "pdf" | "";
  itemName: string;
  itemPath: string;
  itemPaths: string[];      // 多图片路径数组
  currentImageIndex: number; // 当前显示图片索引
  totalImages: number;       // 图片总数
  count: number;
  lastTapTime: number;
  // 备忘录
  memoContent: string;

  // ========== 缩放/拖动相关 ==========
  // 图片容器尺寸
  containerWidth: number;
  containerHeight: number;
  // 图片原始尺寸（每张图片可能不同）
  imageSizes: Record<number, { width: number; height: number }>;
  // 当前变换状态
  scale: number;             // 当前缩放比例
  translateX: number;        // 当前X位移
  translateY: number;        // 当前Y位移
  // 触摸状态
  isTouching: boolean;       // 是否正在触摸
  touchCount: number;        // 当前触摸点数量
  // 双指缩放初始状态
  initialDistance: number;   // 初始双指距离
  initialScale: number;      // 初始缩放值
  initialTranslateX: number; // 初始位移X
  initialTranslateY: number; // 初始位移Y
  lastScaleCenterX: number;  // 上次缩放中心点X
  lastScaleCenterY: number;  // 上次缩放中心点Y
  // 单指拖动初始状态
  panStartX: number;
  panStartY: number;
  // 用于双击检测
  lastTapCheckTime: number;
  // 动画状态
  isAnimating: boolean;      // 是否正在执行回弹动画
  // swiper 控制
  swiperEnabled: boolean;    // 是否允许 swiper 滑动
}

// 缩放范围常量
const MIN_SCALE = 0.8;
const MAX_SCALE = 2.0;
// 滑动切换阈值
const SWIPE_THRESHOLD = 50;
// 双击时间阈值
const DOUBLE_TAP_THRESHOLD = 300;

// 通用的提示配置
const DETAIL_TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

Page<DetailPageData, WechatMiniprogram.IAnyObject>({
  data: {
    itemId: "",
    itemType: "",
    itemName: "",
    itemPath: "",
    itemPaths: [],
    currentImageIndex: 0,
    totalImages: 0,
    count: 0,
    lastTapTime: 0,
    memoContent: "",

    // 缩放/拖动相关
    containerWidth: 0,
    containerHeight: 0,
    imageSizes: {},
    scale: 1,
    translateX: 0,
    translateY: 0,
    isTouching: false,
    touchCount: 0,
    initialDistance: 0,
    initialScale: 1,
    initialTranslateX: 0,
    initialTranslateY: 0,
    lastScaleCenterX: 0,
    lastScaleCenterY: 0,
    panStartX: 0,
    panStartY: 0,
    lastTapCheckTime: 0,
    isAnimating: false,
    swiperEnabled: true,
  },

  onLoad(options: Record<string, string>) {
    if (options.id) {
      this.setData({ itemId: options.id });
      this.loadItemDetail(options.id);
    } else {
      this.showToast("参数错误");
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onReady() {
    this.getContainerSize();
  },

  /**
   * 加载图解详情
   */
  loadItemDetail(id: string, preserveIndex: boolean = false) {
    const imageList = wx.getStorageSync("imageList") || [];
    const fileList = wx.getStorageSync("fileList") || [];
    const allItems = [...imageList, ...fileList];
    const item = allItems.find((item) => item.id === id);

    if (item) {
      const itemPaths = item.paths || [item.path];
      const totalImages = itemPaths.length;

      let newIndex = 0;
      if (preserveIndex) {
        newIndex = Math.min(this.data.currentImageIndex, totalImages - 1);
      } else if (item.type === 'image') {
        const storage = wx.getStorageSync(LAST_IMAGE_INDEX_KEY) || {};
        const savedIndex = storage[id];
        if (savedIndex !== undefined && savedIndex < totalImages) {
          newIndex = savedIndex;
        }
      }

      this.setData({
        itemType: item.type,
        itemName: item.name,
        itemPath: itemPaths[newIndex],
        itemPaths,
        currentImageIndex: newIndex,
        totalImages,
        // 切换图片时重置缩放状态
        scale: 1,
        translateX: 0,
        translateY: 0,
        swiperEnabled: true,
        imageSizes: {},
      });

      wx.setNavigationBarTitle({ title: item.name });
      this.loadMemoContent();
    } else {
      this.showToast("未找到图解");
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  /**
   * 图片加载完成
   */
  onImageLoad(e: WechatMiniprogram.ImageLoad) {
    const { width, height } = e.detail;
    const index = this.data.currentImageIndex;

    // 保存图片尺寸
    const imageSizes = { ...this.data.imageSizes };
    imageSizes[index] = { width, height };
    this.setData({ imageSizes });
  },

  /**
   * 获取预览容器尺寸
   */
  getContainerSize() {
    const query = wx.createSelectorQuery();
    query.select('.preview-area').boundingClientRect((rect: any) => {
      if (rect) {
        this.setData({
          containerWidth: rect.width,
          containerHeight: rect.height,
        });
      }
    }).exec();
  },

  /**
   * 获取当前图片尺寸
   */
  getCurrentImageSize(): { width: number; height: number } {
    const { imageSizes, currentImageIndex, containerWidth, containerHeight } = this.data;
    const size = imageSizes[currentImageIndex];

    if (size) {
      return size;
    }

    // 如果图片尺寸未知，假设与容器等大
    return { width: containerWidth || 375, height: containerHeight || 500 };
  },

  // ========== 统一的手势处理（根据 scale 状态分发） ==========

  /**
   * 触摸开始
   */
  onTouchStart(e: WechatMiniprogram.TouchEvent) {
    const touches = e.touches;
    const touchCount = touches.length;
    const { scale } = this.data;

    if (this.data.isAnimating) {
      this.setData({ isAnimating: false });
    }

    this.setData({ touchCount });

    if (touchCount === 1) {
      const touch = touches[0];
      this.setData({
        isTouching: true,
        panStartX: touch.clientX,
        panStartY: touch.clientY,
        initialTranslateX: this.data.translateX,
        initialTranslateY: this.data.translateY,
      });
    } else if (touchCount === 2) {
      // 双指触摸 - 缩放
      const [touch1, touch2] = touches;
      const distance = this.getDistance(touch1, touch2);
      const center = this.getCenter(touch1, touch2);

      this.setData({
        isTouching: true,
        initialDistance: distance,
        initialScale: scale, // 使用当前 scale 作为初始值
        initialTranslateX: this.data.translateX,
        initialTranslateY: this.data.translateY,
        lastScaleCenterX: center.x,
        lastScaleCenterY: center.y,
      });
      this.lastDistance = distance;
    }
  },

  /**
   * 触摸移动
   */
  onTouchMove(e: WechatMiniprogram.TouchEvent) {
    const touches = e.touches;
    const touchCount = touches.length;
    const { scale } = this.data;

    if (touchCount === 2) {
      // 双指缩放
      this.handlePinchZoom(touches);
    } else if (touchCount === 1 && this.data.isTouching) {
      if (scale > 1) {
        // 缩放状态：拖动图片
        this.handleDragImage(
          touches[0].clientX - this.data.panStartX,
          touches[0].clientY - this.data.panStartY
        );
      }
      // scale <= 1 时，让 swiper 自然响应滑动
    }
  },

  /**
   * 触摸结束
   */
  onTouchEnd(e: WechatMiniprogram.TouchEvent) {
    const { scale, touchCount, panStartX, panStartY, lastTapCheckTime } = this.data;

    // 更新触摸点数量
    const newTouchCount = Math.max(0, touchCount - 1);
    this.setData({ touchCount: newTouchCount });

    // 所有手指离开
    if (newTouchCount === 0) {
      // 检测双击（单指触摸结束时，且移动距离很小）
      const now = Date.now();
      if (touchCount === 1 && e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - panStartX, 2) +
          Math.pow(touch.clientY - panStartY, 2)
        );
        // 移动距离小于 10px 才算点击
        if (moveDistance < 10 && lastTapCheckTime > 0 && now - lastTapCheckTime < DOUBLE_TAP_THRESHOLD) {
          // 双击处理
          if (scale < 1.5) {
            this.setData({
              scale: 1.5,
              translateX: 0,
              translateY: 0,
              isAnimating: true,
            });
          } else {
            this.setData({
              scale: 1,
              translateX: 0,
              translateY: 0,
              isAnimating: true,
            });
          }
          setTimeout(() => this.setData({ isAnimating: false }), 300);
          this.setData({ isTouching: false, lastTapCheckTime: 0 });
          return;
        }
        // 记录本次点击时间
        this.setData({ lastTapCheckTime: now });
      }
      this.setData({ isTouching: false });
      this.springBack();
    }
  },

  /**
   * 双指缩放处理
   * 核心算法：以双指中心为缩放中心
   */
  handlePinchZoom(touches: WechatMiniprogram.Touch[]) {
    const [touch1, touch2] = touches;
    const currentDistance = this.getDistance(touch1, touch2);
    const currentCenter = this.getCenter(touch1, touch2);

    // 计算新缩放比例
    const { initialDistance, initialScale, containerWidth, containerHeight } = this.data;
    let newScale = (initialScale * currentDistance) / initialDistance;

    // 计算缩放中心点位移
    // 公式：新位移 = 初始位移 + (缩放中心 - 容器中心) * (新缩放 - 初始缩放)
    // 但更精确的做法是让缩放中心点在屏幕上的位置不变
    const containerCenterX = containerWidth / 2;
    const containerCenterY = containerHeight / 2;

    // 使用增量计算方式，更跟手
    const scaleDelta = newScale - this.data.scale;

    // 计算新的位移：保持缩放中心点不变
    // 简化公式：位移变化 = - (缩放中心 - 图片中心) * 缩放变化量
    const deltaX = -(currentCenter.x - containerCenterX - this.data.translateX) * (scaleDelta / this.data.scale);
    const deltaY = -(currentCenter.y - containerCenterY - this.data.translateY) * (scaleDelta / this.data.scale);

    // 同时处理双指中心的移动（拖动）
    const centerMoveX = currentCenter.x - this.data.lastScaleCenterX;
    const centerMoveY = currentCenter.y - this.data.lastScaleCenterY;

    this.setData({
      scale: newScale,
      translateX: this.data.translateX + deltaX + centerMoveX,
      translateY: this.data.translateY + deltaY + centerMoveY,
      lastScaleCenterX: currentCenter.x,
      lastScaleCenterY: currentCenter.y,
      // 缩放超过1倍时禁用 swiper
      swiperEnabled: newScale <= 1,
    });

    // 更新用于增量计算的距离
    this.lastDistance = currentDistance;
  },

  // 用于增量计算的临时变量
  lastDistance: 0,

  /**
   * 单指拖动处理
   */
  handlePan(touch: { clientX: number; clientY: number }) {
    const { scale, panStartX, panStartY } = this.data;
    const deltaX = touch.clientX - panStartX;
    const deltaY = touch.clientY - panStartY;

    if (scale > 1) {
      // 缩放状态：拖动图片查看
      this.handleDragImage(deltaX, deltaY);
    }
    // scale <= 1 时，让 swiper 自然响应滑动
  },

  /**
   * 拖动已放大的图片
   */
  handleDragImage(deltaX: number, deltaY: number) {
    const { scale, containerWidth, containerHeight } = this.data;
    const imageSize = this.getCurrentImageSize();

    // 计算最大允许位移（图片边缘不超过容器边界）
    // 由于使用 aspectFit，图片可能小于容器，需要计算实际显示区域
    const fitScale = Math.min(containerWidth / imageSize.width, containerHeight / imageSize.height);
    const displayWidth = imageSize.width * fitScale;
    const displayHeight = imageSize.height * fitScale;

    // 最大位移 = (显示尺寸 * 缩放 - 容器尺寸) / 2
    const maxTranslateX = Math.max(0, (displayWidth * scale - containerWidth) / 2);
    const maxTranslateY = Math.max(0, (displayHeight * scale - containerHeight) / 2);

    // 目标位移
    let newTranslateX = this.data.initialTranslateX + deltaX;
    let newTranslateY = this.data.initialTranslateY + deltaY;

    // 边界弹性阻力
    if (Math.abs(newTranslateX) > maxTranslateX) {
      const overflow = Math.abs(newTranslateX) - maxTranslateX;
      const resistance = 1 / (1 + overflow / 30);
      newTranslateX = Math.sign(newTranslateX) * (maxTranslateX + overflow * resistance * 0.2);
    }

    if (Math.abs(newTranslateY) > maxTranslateY) {
      const overflow = Math.abs(newTranslateY) - maxTranslateY;
      const resistance = 1 / (1 + overflow / 30);
      newTranslateY = Math.sign(newTranslateY) * (maxTranslateY + overflow * resistance * 0.2);
    }

    this.setData({
      translateX: newTranslateX,
      translateY: newTranslateY,
    });
  },

  /**
   * 弹性回弹
   */
  springBack() {
    const { scale, translateX, translateY, containerWidth, containerHeight } = this.data;
    const imageSize = this.getCurrentImageSize();

    let targetScale = scale;
    let targetTranslateX = translateX;
    let targetTranslateY = translateY;
    let needsAnimation = false;

    // 1. 缩放范围回弹
    if (scale < MIN_SCALE) {
      targetScale = MIN_SCALE;
      needsAnimation = true;
    } else if (scale > MAX_SCALE) {
      targetScale = MAX_SCALE;
      needsAnimation = true;
    }

    // 2. 位移边界回弹
    if (targetScale > 1) {
      const fitScale = Math.min(containerWidth / imageSize.width, containerHeight / imageSize.height);
      const displayWidth = imageSize.width * fitScale;
      const displayHeight = imageSize.height * fitScale;

      const maxTranslateX = Math.max(0, (displayWidth * targetScale - containerWidth) / 2);
      const maxTranslateY = Math.max(0, (displayHeight * targetScale - containerHeight) / 2);

      if (Math.abs(translateX) > maxTranslateX) {
        targetTranslateX = Math.sign(translateX) * maxTranslateX;
        needsAnimation = true;
      }
      if (Math.abs(translateY) > maxTranslateY) {
        targetTranslateY = Math.sign(translateY) * maxTranslateY;
        needsAnimation = true;
      }
    } else {
      // scale <= 1 时位移归零
      if (translateX !== 0 || translateY !== 0) {
        targetTranslateX = 0;
        targetTranslateY = 0;
        needsAnimation = true;
      }
      // 恢复 swiper
      this.setData({ swiperEnabled: true });
    }

    if (needsAnimation) {
      this.setData({
        isAnimating: true,
        scale: targetScale,
        translateX: targetTranslateX,
        translateY: targetTranslateY,
      });
      setTimeout(() => {
        this.setData({ isAnimating: false });
        // 如果缩放回弹到 <= 1，恢复 swiper
        if (targetScale <= 1) {
          this.setData({ swiperEnabled: true });
        }
      }, 300);
    }
  },

  /**
   * 双击缩放
   */
  onDoubleTap() {
    const { scale } = this.data;

    if (scale < 1.5) {
      this.setData({
        scale: 1.5,
        translateX: 0,
        translateY: 0,
        isAnimating: true,
        swiperEnabled: false,
      });
    } else {
      this.setData({
        scale: 1,
        translateX: 0,
        translateY: 0,
        isAnimating: true,
        swiperEnabled: true,
      });
    }

    setTimeout(() => this.setData({ isAnimating: false }), 300);
  },

  /**
   * 计算两点距离
   */
  getDistance(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): number {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
  },

  /**
   * 计算两点中心
   */
  getCenter(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }): { x: number; y: number } {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  },

  // ========== Swiper 相关 ==========

  /**
   * Swiper 切换
   */
  onSwiperChange(e: WechatMiniprogram.SwiperChange) {
    const newIndex = e.detail.current;

    this.setData({
      currentImageIndex: newIndex,
      itemPath: this.data.itemPaths[newIndex],
      // 切换图片时重置缩放状态
      scale: 1,
      translateX: 0,
      translateY: 0,
      swiperEnabled: true,
    });
  },

  /**
   * 图片点击（支持双击放大）
   */
  onImageTap() {
    const now = Date.now();
    if (now - this.data.lastTapTime < DOUBLE_TAP_THRESHOLD) {
      this.onDoubleTap();
    }
    this.setData({ lastTapTime: now });
  },

  /**
   * 缩放状态下图片点击（双击恢复原始状态）
   */
  onScaleImageTap() {
    const now = Date.now();
    if (now - this.data.lastTapTime < DOUBLE_TAP_THRESHOLD) {
      // 双击恢复到原始状态
      this.setData({
        scale: 1,
        translateX: 0,
        translateY: 0,
        isAnimating: true,
      });
      setTimeout(() => this.setData({ isAnimating: false }), 300);
    }
    this.setData({ lastTapTime: now });
  },

  /**
   * 预览图片
   */
  previewImage() {
    if (this.data.itemType === "image") {
      wx.previewImage({
        current: this.data.itemPath,
        urls: this.data.itemPaths,
      });
    }
  },

  showToast(title: string) {
    wx.showToast({ title, ...DETAIL_TOAST_CONFIG });
  },

  onShow() {
    if (this.data.itemId) {
      this.loadItemDetail(this.data.itemId, true);
    }
    this.getContainerSize();
  },

  onHide() { this.saveLastImageIndex(); },
  onUnload() { this.saveLastImageIndex(); },

  saveLastImageIndex() {
    const { itemId, currentImageIndex, itemType } = this.data;
    if (!itemId || itemType !== 'image') return;
    const storage = wx.getStorageSync(LAST_IMAGE_INDEX_KEY) || {};
    storage[itemId] = currentImageIndex;
    wx.setStorageSync(LAST_IMAGE_INDEX_KEY, storage);
  },

  onMemoTap() {
    const { itemId, memoContent } = this.data;
    wx.navigateTo({
      url: `/pages/memo/memo?key=${itemId}&content=${encodeURIComponent(memoContent)}&type=item`,
      events: {
        onMemoContentChange: (data: { key: string; content: string }) => {
          if (data.key === itemId) {
            this.setData({ memoContent: data.content });
            this.saveMemoContent(data.content);
          }
        },
      },
    });
  },

  loadMemoContent() {
    const itemId = this.data.itemId;
    if (!itemId) return;
    const memos = wx.getStorageSync(MEMO_STORAGE_KEY) || {};
    this.setData({ memoContent: memos[itemId] || "" });
  },

  saveMemoContent(content: string) {
    const itemId = this.data.itemId;
    if (!itemId) return;
    const memos = wx.getStorageSync(MEMO_STORAGE_KEY) || {};
    memos[itemId] = content;
    wx.setStorageSync(MEMO_STORAGE_KEY, memos);
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/home/home',
      imageUrl: '/assets/share.png'
    }
  },
});