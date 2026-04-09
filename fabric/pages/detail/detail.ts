// pages/detail/detail.ts
import { convertPdfToImages, continuePdfConversion, showLoading, hideLoading } from '../../utils/pdf_converter';
import { vibrate } from '../../utils/vibrate';

// 备忘录存储键
const MEMO_STORAGE_KEY = "itemMemos";
// 图片索引存储键
const LAST_IMAGE_INDEX_KEY = "lastImageIndex";
// 临时计数器新手引导是否已展示
const TEMP_COUNTER_TIPS_SHOWN_KEY = "tempCounterTipsShown";

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
  // PDF转换状态
  isConverting: boolean;     // 是否正在转换PDF
  isPageHidden: boolean;     // 页面是否已隐藏（用户返回）

  // ========== 临时计数器 ==========
  tempCounters: Array<{
    id: string;
    count: number;
    isActive: boolean;
    x: number;
    y: number;
    name: string;
    zOrder: number;            // 触摸排序，越大越在上层
  }>;
  draggingCounterId: string;
  dragOffsetX: number;
  dragOffsetY: number;
  didDrag: boolean;
  showDeleteForId: string;
  // 震动/音效开关（与 simple-counter 一致，从存储读取）
  isVibrationOn: boolean;
  isVoiceOn: boolean;
  // 新手引导 tips
  showTempCounterTipStep: number;  // 0=不显示, 1=同步开关tip, 2=长按删除tip
  tempCounterTipTargetId: string;  // tip 指向的计数器 id
}

// 缩放范围常量
const MIN_SCALE = 1.0;
const MAX_SCALE = 6.0;
// 双击时间阈值
const DOUBLE_TAP_THRESHOLD = 300;

// 通用的提示配置
const DETAIL_TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1000,
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
    isConverting: false,
    isPageHidden: false,
    tempCounters: [],
    draggingCounterId: '',
    dragOffsetX: 0,
    dragOffsetY: 0,
    didDrag: false,
    showDeleteForId: '',
    isVibrationOn: false,
    isVoiceOn: false,
    showTempCounterTipStep: 0,
    tempCounterTipTargetId: '',
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
  async loadItemDetail(id: string, preserveIndex: boolean = false) {
    // 如果正在转换 PDF，避免重复调用
    if (this.data.isConverting) {
      return;
    }

    const imageList = wx.getStorageSync("imageList") || [];
    const fileList = wx.getStorageSync("fileList") || [];
    const allItems = [...imageList, ...fileList];
    const item = allItems.find((item) => item.id === id);

    if (item) {
      console.log('item', item)

      // 兜底逻辑：已同步图解但本地文件不存在，或云端有新图片需要下载
      if (item.syncStatus === 'synced') {
        const paths = item.paths || [];
        const cloudImages = item.cloudImages || [];
        const hasValidPaths = paths.length > 0 && this.checkLocalFilesExist(paths);

        // 检查是否有新图片需要下载（云端图片数 > 本地图片数）
        const hasNewImages = cloudImages.length > paths.filter((p: string) => p).length;
        console.log('[Detail] 检查图片同步状态:', {
          name: item.name,
          localPaths: paths.length,
          cloudImages: cloudImages.length,
          hasValidPaths,
          hasNewImages
        });

        if (!hasValidPaths || hasNewImages) {
          // 检查是否有云端图片数据
          if (cloudImages.length > 0) {
            console.log('[Detail] 开始下载云端图片...');
            await this.downloadCloudDiagramImages(item);
            return;
          } else {
            // 没有云端图片数据，显示错误
            this.showToast('图解数据丢失');
            setTimeout(() => wx.navigateBack(), 1500);
            return;
          }
        }
      }

      // 检查是否为PDF且尚未转换
      if (item.type === 'pdf' && (!item.paths || item.paths.length === 0)) {
        // 需要进行PDF转换
        await this.convertPdfItem(item);
        return;
      }

      // 检查是否为部分加载的PDF（有云端文件ID且图片数量少于总数）
      if (item.type === 'pdf' && item.cloudFileId && item.totalPdfPageCount &&
          item.paths && item.paths.length < item.totalPdfPageCount) {
        // 继续加载缺失的页面
        await this.continueConvertPdfItem(item);
        return;
      }

      const itemPaths = item.paths || [item.path];
      const totalImages = itemPaths.length;

      let newIndex = 0;
      if (preserveIndex) {
        newIndex = Math.min(this.data.currentImageIndex, totalImages - 1);
      } else {
        // 恢复上次浏览的页码（图片和PDF都支持）
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
   * 转换PDF项目为图片
   */
  async convertPdfItem(item: any) {
    const { id, path, name } = item;

    this.setData({ isConverting: true });
    showLoading('首次加载较慢，请等等我');

    try {
      // 转换PDF为图片
      const result = await convertPdfToImages(path, id, (progress) => {
        // 仅在页面可见时更新
        if (!this.data.isPageHidden) {
          // 第一页下载完成后立即显示图片，让用户能边加载边看
          if (progress.current === 1) {
            this.setData({
              itemType: 'pdf',
              itemName: name,
              itemPath: progress.paths[0],
              itemPaths: progress.paths,
              currentImageIndex: 0,
              totalImages: progress.total,
              scale: 1,
              translateX: 0,
              translateY: 0,
              swiperEnabled: true,
              imageSizes: {},
            });
            wx.setNavigationBarTitle({ title: name });
            this.loadMemoContent();
          }

          // 继续显示进度（用户已能看到第一页内容）
          wx.showLoading({
            title: `加载中 ${progress.current}/${progress.total}`,
            mask: true
          });
        }
      });

      hideLoading();

      // 检测是否为部分成功（部分页面下载失败）
      const isPartialSuccess = result.isPartialSuccess || result.paths.length < result.totalPageCount;

      // 只有完全成功才删除云端 PDF
      // 部分成功时保留云端文件，下次进入可以继续下载
      if (!isPartialSuccess) {
        wx.cloud.deleteFile({
          fileList: [result.cloudFileId],
          success: () => console.log('云端PDF已清理:', result.cloudFileId),
          fail: (err) => console.error('云端PDF清理失败:', err)
        });
      }

      // 更新fileList中的项目
      const fileList = wx.getStorageSync('fileList') || [];
      const DEFAULT_COVER = '/assets/default_Illustration.png';
      const updatedFileList = fileList.map((file: any) => {
        if (file.id === id) {
          // 判断是否使用默认封面（cover为空或等于默认路径）
          const isDefaultCover = !file.cover || file.cover === DEFAULT_COVER;
          return {
            ...file,
            paths: result.paths,
            path: result.paths[0], // 兼容旧数据
            pdfPageCount: result.pageCount, // 实际下载成功的页数
            totalPdfPageCount: result.totalPageCount, // PDF真实总页数（用于检测部分加载）
            // 如果是默认封面，则将首图设置为封面
            cover: isDefaultCover ? result.paths[0] : file.cover,
            // 部分成功时保留 cloudFileId，下次可以继续下载
            cloudFileId: isPartialSuccess ? result.cloudFileId : undefined,
          };
        }
        return file;
      });

      wx.setStorageSync('fileList', updatedFileList);

      // 仅在页面可见时更新UI和显示提示
      if (!this.data.isPageHidden) {
        // 显示转换后的图片
        const itemPaths = result.paths;
        const totalImages = itemPaths.length;

        this.setData({
          itemType: 'pdf',
          itemName: name,
          itemPath: itemPaths[0],
          itemPaths,
          currentImageIndex: 0,
          totalImages,
          scale: 1,
          translateX: 0,
          translateY: 0,
          swiperEnabled: true,
          imageSizes: {},
          isConverting: false,
        });

        wx.setNavigationBarTitle({ title: name });
        this.loadMemoContent();

        // 根据加载结果显示不同的提示
        if (isPartialSuccess) {
          this.showToast(`已加载 ${result.pageCount}/${result.totalPageCount} 页，网络恢复后重新进入可继续加载`);
        } else {
          this.showToast(`完成啦！共有${result.pageCount}页`);
        }
      } else {
        // 页面已隐藏，仅更新转换状态
        this.setData({ isConverting: false });
      }
    } catch (err: any) {
      hideLoading();
      console.error('PDF转换失败:', err);
      this.setData({ isConverting: false });
      // 仅在页面可见时提示错误并返回
      if (!this.data.isPageHidden) {
        // 显示具体的错误信息
        const errorMsg = err?.message || '加载失败，稍后再试一下吧';
        this.showToast(errorMsg);
        setTimeout(() => wx.navigateBack(), 1500);
      }
    }
  },

  /**
   * 继续加载部分转换的PDF
   */
  async continueConvertPdfItem(item: any) {
    const { id, name, cloudFileId, paths, totalPdfPageCount } = item;

    this.setData({ isConverting: true });

    // 先显示已有的图片
    const itemPaths = paths;
    const totalImages = itemPaths.length;
    this.setData({
      itemType: 'pdf',
      itemName: name,
      itemPath: itemPaths[0],
      itemPaths,
      currentImageIndex: 0,
      totalImages,
      scale: 1,
      translateX: 0,
      translateY: 0,
      swiperEnabled: true,
      imageSizes: {},
    });
    wx.setNavigationBarTitle({ title: name });
    this.loadMemoContent();

    wx.showLoading({
      title: `继续加载 ${paths.length}/${totalPdfPageCount}`,
      mask: true
    });

    try {
      // 继续下载缺失的页面
      const result = await continuePdfConversion(
        cloudFileId,
        paths,
        totalPdfPageCount,
        id,
        (progress) => {
          // 仅在页面可见时更新进度和图片
          if (!this.data.isPageHidden) {
            // 每下载一页后更新图片列表
            this.setData({
              itemPaths: progress.paths,
              totalImages: progress.paths.length,
            });

            wx.showLoading({
              title: `加载中 ${progress.current}/${progress.total}`,
              mask: true
            });
          }
        }
      );

      hideLoading();

      // 更新fileList中的项目
      const fileList = wx.getStorageSync('fileList') || [];
      const updatedFileList = fileList.map((file: any) => {
        if (file.id === id) {
          return {
            ...file,
            paths: result.paths,
            path: result.paths[0],
            pdfPageCount: result.pageCount,
            // 如果全部加载完成，清除 cloudFileId 和 totalPdfPageCount
            cloudFileId: result.isComplete ? undefined : cloudFileId,
            totalPdfPageCount: result.isComplete ? undefined : totalPdfPageCount,
          };
        }
        return file;
      });

      wx.setStorageSync('fileList', updatedFileList);

      // 如果全部加载完成，删除云端 PDF
      if (result.isComplete) {
        wx.cloud.deleteFile({
          fileList: [cloudFileId],
          success: () => console.log('云端PDF已清理:', cloudFileId),
          fail: (err) => console.error('云端PDF清理失败:', err)
        });
      }

      // 仅在页面可见时更新UI和显示提示
      if (!this.data.isPageHidden) {
        const itemPaths = result.paths;
        const totalImages = itemPaths.length;

        this.setData({
          itemType: 'pdf',
          itemName: name,
          itemPath: itemPaths[0],
          itemPaths,
          currentImageIndex: 0,
          totalImages,
          scale: 1,
          translateX: 0,
          translateY: 0,
          swiperEnabled: true,
          imageSizes: {},
          isConverting: false,
        });

        wx.setNavigationBarTitle({ title: name });
        this.loadMemoContent();

        if (result.isComplete) {
          this.showToast(`完成啦！共有${result.pageCount}页`);
        } else {
          this.showToast(`已加载 ${result.pageCount}/${totalPdfPageCount} 页`);
        }
      } else {
        this.setData({ isConverting: false });
      }
    } catch (err: any) {
      hideLoading();
      console.error('继续加载PDF失败:', err);
      this.setData({ isConverting: false });
      if (!this.data.isPageHidden) {
        // 加载失败时，显示已有的图片
        const itemPaths = paths;
        const totalImages = itemPaths.length;

        this.setData({
          itemType: 'pdf',
          itemName: name,
          itemPath: itemPaths[0],
          itemPaths,
          currentImageIndex: 0,
          totalImages,
          scale: 1,
          translateX: 0,
          translateY: 0,
          swiperEnabled: true,
          imageSizes: {},
        });

        wx.setNavigationBarTitle({ title: name });
        this.loadMemoContent();

        // 显示具体的错误信息
        const errorMsg = err?.message || '网络异常，加载中断';
        this.showToast(errorMsg);
      }
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
    // 重置针织总时长计时器的活跃时间
    const app = getApp<IAppOption>();
    if (app) {
      app.resetKnittingActivity();
    }

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
          if (scale < 2.0) {
            // 放大：先显示缩放层（isAnimating=true 使 hidden 条件为 false），
            // 下一帧再改 scale，让 CSS transition 生效
            this.setData({
              isAnimating: true,
              swiperEnabled: false,
              translateX: 0,
              translateY: 0,
            });
            wx.nextTick(() => {
              this.setData({ scale: 2.0 });
              setTimeout(() => this.setData({ isAnimating: false }), 300);
            });
          } else {
            // 缩小：直接动画回 scale=1，动画结束后 hidden 生效
            this.setData({
              scale: 1,
              translateX: 0,
              translateY: 0,
              isAnimating: true,
            });
            setTimeout(() => this.setData({ isAnimating: false }), 300);
          }
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

    // 硬限制缩放范围，避免超出后回弹动画导致闪白
    newScale = Math.max(MIN_SCALE, Math.min(newScale, MAX_SCALE));

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

    // 计算目标位移
    let newTranslateX = this.data.translateX + deltaX + centerMoveX;
    let newTranslateY = this.data.translateY + deltaY + centerMoveY;

    // 限制位移在图片边界内，防止露出背景色
    if (newScale > 1) {
      const imageSize = this.getCurrentImageSize();
      const fitScale = Math.min(containerWidth / imageSize.width, containerHeight / imageSize.height);
      const displayWidth = imageSize.width * fitScale;
      const displayHeight = imageSize.height * fitScale;
      const maxTX = Math.max(0, (displayWidth * newScale - containerWidth) / 2);
      const maxTY = Math.max(0, (displayHeight * newScale - containerHeight) / 2);
      newTranslateX = Math.max(-maxTX, Math.min(newTranslateX, maxTX));
      newTranslateY = Math.max(-maxTY, Math.min(newTranslateY, maxTY));
    }

    this.setData({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
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
  // zOrder 递增计数器（栈式层级）
  _nextZOrder: 0,
  // 自定义长按计时器
  _longPressTimer: null as ReturnType<typeof setTimeout> | null,
  _longPressId: '',
  _longPressTouchX: 0,
  _longPressTouchY: 0,

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

    // 目标位移，限制在边界内
    const newTranslateX = Math.max(-maxTranslateX, Math.min(this.data.initialTranslateX + deltaX, maxTranslateX));
    const newTranslateY = Math.max(-maxTranslateY, Math.min(this.data.initialTranslateY + deltaY, maxTranslateY));

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
      // 先启用 CSS transition，下一帧再改 transform，避免渲染引擎闪白
      this.setData({ isAnimating: true });
      wx.nextTick(() => {
        this.setData({
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
      });
    }
  },

  /**
   * 双击缩放
   */
  onDoubleTap() {
    const { scale, isAnimating } = this.data;
    if (isAnimating) return;

    if (scale < 2.0) {
      // 放大：先显示缩放层，下一帧再改 scale，让 CSS transition 生效
      this.setData({
        isAnimating: true,
        swiperEnabled: false,
        translateX: 0,
        translateY: 0,
      });
      wx.nextTick(() => {
        this.setData({ scale: 2.0 });
        setTimeout(() => this.setData({ isAnimating: false }), 300);
      });
    } else {
      // 缩小：直接动画回 scale=1，动画结束后 hidden 生效
      this.setData({
        scale: 1,
        translateX: 0,
        translateY: 0,
        isAnimating: true,
      });
      setTimeout(() => this.setData({ isAnimating: false }), 300);
    }
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
    // 重置针织总时长计时器的活跃时间
    const app = getApp<IAppOption>();
    if (app) {
      app.resetKnittingActivity();
    }

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
    // 标记页面可见
    this.setData({ isPageHidden: false });

    // 读取震动/音效设置（与 simple-counter 一致）
    this.setData({
      isVibrationOn: !!wx.getStorageSync('counter_vibration_state'),
      isVoiceOn: !!wx.getStorageSync('counter_voice_state'),
    });

    if (this.data.itemId) {
      this.loadItemDetail(this.data.itemId, true);
    }
    this.getContainerSize();
    this.loadTempCounters();
    // 开始针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      // 先从云端同步最新数据（多设备同步），再开始计时
      app.syncFromCloud().catch(err => {
        console.error('[Detail] 同步云端数据失败:', err)
      })
      app.startKnittingSession();

      // 已登录时启动图解心跳同步
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn && this.data.itemId) {
        app.globalData.activeDiagramIds = [this.data.itemId];
        app.startDiagramHeartbeat();
      }
    }
  },

  onHide() {
    // 标记页面已隐藏
    this.setData({ isPageHidden: true });

    // 如果正在转换PDF，隐藏loading但让转换继续在后台执行
    if (this.data.isConverting) {
      hideLoading();
    }

    this.saveLastImageIndex();
    this.saveTempCounters();
    // 暂停针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      app.pauseKnittingSession(true);
      // 停止心跳并同步图解数据
      app.stopDiagramHeartbeat();
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn && this.data.itemId) {
        app.forceSyncDiagramCounterData(this.data.itemId).catch((err: any) => {
          console.error('[Detail] 同步图解数据失败:', err);
        });
      }
      app.globalData.activeDiagramIds = [];
    }
  },

  onUnload() {
    // 标记页面已隐藏
    this.setData({ isPageHidden: true });

    // 如果正在转换PDF，隐藏loading但让转换继续在后台执行
    if (this.data.isConverting) {
      hideLoading();
    }

    this.saveLastImageIndex();
    this.saveTempCounters();
    // 暂停针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      app.pauseKnittingSession(true);
      // 停止心跳并同步图解数据
      app.stopDiagramHeartbeat();
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn && this.data.itemId) {
        app.forceSyncDiagramCounterData(this.data.itemId).catch((err: any) => {
          console.error('[Detail] 同步图解数据失败:', err);
        });
      }
      app.globalData.activeDiagramIds = [];
    }
  },

  saveLastImageIndex() {
    const { itemId, currentImageIndex } = this.data;
    if (!itemId) return;
    const storage = wx.getStorageSync(LAST_IMAGE_INDEX_KEY) || {};
    storage[itemId] = currentImageIndex;
    wx.setStorageSync(LAST_IMAGE_INDEX_KEY, storage);
  },

  onTempCounterTap() {
    const counters = this.data.tempCounters;
    if (counters.length >= 1) {
      this.showToast('暂时只能创建1个临时计数器～');
      return;
    }
    const pos = this._getDefaultPosition(counters.length);
    const newCounter = {
      id: `temp_${Date.now()}`,
      count: 0,
      isActive: false,
      x: pos.x,
      y: pos.y,
      name: '',
      zOrder: ++this._nextZOrder,
    };
    const newCounters = [...counters, newCounter];
    this.setData({
      tempCounters: newCounters,
    });
    this.saveTempCounters();

    // 首次创建临时计数器时展示新手引导
    if (counters.length === 0 && !wx.getStorageSync(TEMP_COUNTER_TIPS_SHOWN_KEY)) {
      this.setData({
        showTempCounterTipStep: 1,
        tempCounterTipTargetId: newCounter.id,
      });
    }
  },

  /** 计算新建计数器的默认位置（左下角排列，满行向上换行） */
  _getDefaultPosition(index: number): { x: number; y: number } {
    const sys = wx.getSystemInfoSync();
    const ratio = sys.windowWidth / 750;
    const counterWidthPx = 180 * ratio;
    const counterHeightPx = 120 * ratio;
    const padding = 24 * ratio;
    const gap = 16 * ratio;
    const bannerHeight = 120 * ratio; // counter-section 高度
    const minY = bannerHeight + padding;

    const maxPerRow = Math.floor((sys.windowWidth - 2 * padding + gap) / (counterWidthPx + gap));
    const row = Math.floor(index / maxPerRow);
    const col = index % maxPerRow;

    const x = padding + col * (counterWidthPx + gap);
    const bottomY = sys.windowHeight - padding - counterHeightPx;
    const y = Math.max(minY, bottomY - row * (counterHeightPx + gap));

    return { x, y };
  },

  onTempCounterIncrease(e: WechatMiniprogram.CustomEvent) {
    if (this.data.showDeleteForId) {
      this.setData({ showDeleteForId: '' });
    }
    const id = e.currentTarget.dataset.id;
    const counter = this.data.tempCounters.find((c) => c.id === id);
    if (!counter) return;

    // 临时计数器上限 999（与主计数器一致）
    if (counter.count >= 999) return;

    const counters = this.data.tempCounters.map((c) =>
      c.id === id ? { ...c, count: c.count + 1 } : c
    );
    this.setData({ tempCounters: counters });
    this.saveTempCounters();

    // 同步主计数器
    if (counter.isActive) {
      this.syncMainCounter(1);
    }

    // 震动和音效反馈（与 simple-counter 一致）
    if (this.data.isVibrationOn) vibrate();
    if (this.data.isVoiceOn) {
      const audio = wx.createInnerAudioContext();
      audio.src = '/assets/audio_voice.m4a';
      audio.onEnded(() => audio.destroy());
      audio.play();
    }
  },

  onTempCounterDecrease(e: WechatMiniprogram.CustomEvent) {
    if (this.data.showDeleteForId) {
      this.setData({ showDeleteForId: '' });
    }
    const id = e.currentTarget.dataset.id;
    const counter = this.data.tempCounters.find((c) => c.id === id);
    if (!counter || counter.count <= 0) return;

    const counters = this.data.tempCounters.map((c) =>
      c.id === id ? { ...c, count: c.count - 1 } : c
    );
    this.setData({ tempCounters: counters });
    this.saveTempCounters();

    // 同步主计数器
    if (counter.isActive) {
      this.syncMainCounter(-1);
    }

    // 震动和音效反馈（与 simple-counter 一致）
    if (this.data.isVibrationOn) vibrate();
    if (this.data.isVoiceOn) {
      const audio = wx.createInnerAudioContext();
      audio.src = '/assets/audio_voice.m4a';
      audio.onEnded(() => audio.destroy());
      audio.play();
    }
  },

  /** 同步主计数器（simple-counter）增减 */
  syncMainCounter(delta: number) {
    const comp = this.selectComponent('#detail-counter');
    if (!comp) return;
    const currentCount = comp.getCurrentCount();
    const newCount = Math.max(0, Math.min(999, currentCount + delta));
    comp.setCount(newCount);
  },

  /** 点击顶部 icon 切换同步开关 */
  onTempCounterIconTap(e: WechatMiniprogram.CustomEvent) {
    // 编辑态（长按触发）下不响应
    if (this.data.showDeleteForId) return;
    const id = e.currentTarget.dataset.id;
    const counter = this.data.tempCounters.find((c) => c.id === id);
    if (!counter) return;
    const newActive = !counter.isActive;
    const counters = this.data.tempCounters.map((c) =>
      c.id === id ? { ...c, isActive: newActive } : c
    );
    this.setData({ tempCounters: counters });
    this.saveTempCounters();
    this.showToast(newActive ? '关联开关已打开' : '关联开关已关闭');
  },

  /** 触摸开始：立即开始拖动 + 长按进入编辑 */
  onTempCounterTouchStart(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    const touch = e.touches[0];
    this._longPressId = id;
    this._longPressTouchX = touch.clientX;
    this._longPressTouchY = touch.clientY;
    this._longPressTimer = null;

    const counter = this.data.tempCounters.find((c) => c.id === id);
    if (!counter) return;

    // 递增 zOrder，使当前触摸的计数器在最上层
    this._nextZOrder++;
    const newZOrder = this._nextZOrder;
    const counters = this.data.tempCounters.map((c) =>
      c.id === id ? { ...c, zOrder: newZOrder } : c
    );

    // 立即进入拖动就绪
    this.setData({
      tempCounters: counters,
      draggingCounterId: id,
      dragOffsetX: touch.clientX - counter.x,
      dragOffsetY: touch.clientY - counter.y,
      didDrag: false,
    });

    // 非编辑态下，同时启动长按计时器进入编辑态
    if (!this.data.showDeleteForId) {
      this._longPressTimer = setTimeout(() => {
        this._longPressTimer = null;
        this.setData({
          showDeleteForId: 'all',
        });
      }, 500);
    }
  },

  /** 拖动计数器（限制在可见区域内） */
  onTempCounterDragMove(e: WechatMiniprogram.TouchEvent) {
    // 手指移动超过阈值时取消长按计时器（用户在滑动，不是长按）
    if (this._longPressTimer) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - this._longPressTouchX);
      const dy = Math.abs(touch.clientY - this._longPressTouchY);
      if (dx > 10 || dy > 10) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
    }
    const { draggingCounterId, dragOffsetX, dragOffsetY, tempCounters } = this.data;
    if (!draggingCounterId) return;
    const touch = e.touches[0];
    const sys = wx.getSystemInfoSync();
    const ratio = sys.windowWidth / 750;
    const counterWidthPx = 180 * ratio;
    const counterHeightPx = 120 * ratio;
    // 限制在可见区域内：不超出屏幕边界
    // 删除按钮在右上角溢出 14rpx，需要额外预留
    const deleteOverflowPx = 14 * ratio;
    const minX = 0;
    const maxX = sys.windowWidth - counterWidthPx - deleteOverflowPx;
    const minY = deleteOverflowPx;
    const maxY = sys.windowHeight - counterHeightPx;

    let newX = touch.clientX - dragOffsetX;
    let newY = touch.clientY - dragOffsetY;
    newX = Math.max(minX, Math.min(newX, maxX));
    newY = Math.max(minY, Math.min(newY, maxY));

    const counters = tempCounters.map((c) =>
      c.id === draggingCounterId ? { ...c, x: newX, y: newY } : c
    );
    this.setData({ tempCounters: counters, didDrag: true });
  },

  /** 拖动结束 */
  onTempCounterDragEnd() {
    // 取消长按计时器
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    const { draggingCounterId } = this.data;
    if (!draggingCounterId) return;
    this.setData({
      draggingCounterId: '',
    });
    this.saveTempCounters();
  },

  /** 点击标签文案重命名 */
  onTempCounterLabelTap(e: WechatMiniprogram.CustomEvent) {
    // 编辑态（长按触发）下不响应
    if (this.data.showDeleteForId) return;
    const id = e.currentTarget.dataset.id;
    const counter = this.data.tempCounters.find((c) => c.id === id);
    if (!counter) return;
    wx.showModal({
      title: '修改名称',
      editable: true,
      placeholderText: '请输入名称',
      content: counter.name || '',
      success: (res) => {
        if (res.confirm && res.content !== undefined) {
          const trimmed = res.content.trim();
          const counters = this.data.tempCounters.map((c) =>
            c.id === id ? { ...c, name: trimmed } : c
          );
          this.setData({ tempCounters: counters });
          this.saveTempCounters();
        }
      },
    });
  },

  /** 删除计数器 */
  onTempCounterDelete(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id;
    const counters = this.data.tempCounters.filter((c) => c.id !== id);
    // 全部删除时才退出编辑态，否则保持编辑态
    const showDelete = counters.length > 0 ? 'all' : '';
    this.setData({
      tempCounters: counters,
      showDeleteForId: showDelete,
      draggingCounterId: '',
    });
    this.saveTempCounters();
  },

  /** 点击空白关闭删除按钮 */
  onDismissDelete() {
    this.setData({ showDeleteForId: '' });
  },

  /** 新手引导 tips 关闭 */
  onTempCounterTipDismiss(e: WechatMiniprogram.CustomEvent) {
    const step = e.currentTarget.dataset.step;
    if (step === 1) {
      this.setData({ showTempCounterTipStep: 2 });
    } else if (step === 2) {
      this.setData({ showTempCounterTipStep: 0, tempCounterTipTargetId: '' });
      wx.setStorageSync(TEMP_COUNTER_TIPS_SHOWN_KEY, true);
    }
  },

  saveTempCounters() {
    const { itemId, tempCounters } = this.data;
    if (!itemId) return;
    wx.setStorageSync(`tempCounters_${itemId}`, tempCounters);
  },

  loadTempCounters() {
    const { itemId } = this.data;
    if (!itemId) return;
    const raw: Array<any> = wx.getStorageSync(`tempCounters_${itemId}`) || [];
    // 迁移旧数据：补充缺失字段
    let needsRecalc = false;
    const counters = raw.map((c: any, index: number) => {
      if (c.x === undefined || c.y === undefined) {
        needsRecalc = true;
      }
      return {
        id: c.id || `temp_${Date.now()}_${index}`,
        count: c.count || 0,
        isActive: c.isActive || false,
        x: c.x || 0,
        y: c.y || 0,
        name: c.name || '',
        zOrder: c.zOrder ?? index,
      };
    });
    this.setData({ tempCounters: counters });
    // 如果有旧数据缺少位置，重新计算
    if (needsRecalc && counters.length > 0) {
      const updated = counters.map((c: any, index: number) => {
        if (c.x === 0 && c.y === 0) {
          return { ...c, ...this._getDefaultPosition(index) };
        }
        return c;
      });
      this.setData({ tempCounters: updated });
    }
    // 初始化 zOrder 计数器，避免新触摸的计数器层级低于已有计数器
    this._nextZOrder = counters.reduce((max, c) => Math.max(max, c.zOrder || 0), 0);
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

    // 重置心跳计时器（用户有操作）
    const app = getApp<IAppOption>();
    if (app) app.resetDiagramHeartbeat();
  },

  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/home/home',
      imageUrl: '/assets/share.png'
    }
  },

  /**
   * 检查本地文件是否存在
   * @param paths 文件路径数组
   * @returns 是否所有文件都存在
   */
  checkLocalFilesExist(paths: string[]): boolean {
    if (!paths || paths.length === 0) {
      return false;
    }
    const fs = wx.getFileSystemManager();
    try {
      // 检查第一个文件是否存在（如果第一个存在，通常其他也存在）
      fs.accessSync(paths[0]);
      return true;
    } catch {
      console.log('本地文件不存在:', paths[0]);
      return false;
    }
  },

  /**
   * 从云端下载图解图片（兜底逻辑）
   * 当本地文件不存在时，从云端下载到本地
   * 优先使用传入的 cloudImages 字段，避免重复调用云函数
   */
  async downloadCloudDiagramImages(item: any) {
    const { id, name, cloudImages } = item;

    this.setData({ isConverting: true });
    wx.showLoading({ title: '加载中...', mask: true });

    try {
      // 1. 获取云端图片ID列表
      let cloudImageIds: string[] = [];

      if (cloudImages && cloudImages.length > 0) {
        // 优先使用传入的 cloudImages 字段
        cloudImageIds = cloudImages;
      } else {
        // 兜底：调用云函数获取数据
        const res = await wx.cloud.callFunction({
          name: 'syncDiagramData',
          data: { action: 'download' }
        }) as any;

        if (!res.result?.success) {
          throw new Error('获取云端数据失败');
        }

        const cloudItem = res.result.data.diagrams.find((d: any) => d.id === id);
        if (!cloudItem || !cloudItem.images || cloudItem.images.length === 0) {
          throw new Error('图解数据不存在');
        }
        cloudImageIds = cloudItem.images;
      }

      // 2. 构建本地已有图片的映射（cloudId -> localPath）
      const existingPaths = item.paths || [];
      const existingCloudImages = item.cloudImages || [];
      const cloudIdToLocalPath: Record<string, string> = {};

      console.log('[Detail] 本地已有图片:', existingPaths.length, '云端图片:', cloudImageIds.length);

      // 建立映射：只映射本地存在的图片
      const fs = wx.getFileSystemManager();
      for (let i = 0; i < existingCloudImages.length && i < existingPaths.length; i++) {
        if (existingCloudImages[i] && existingPaths[i]) {
          try {
            fs.accessSync(existingPaths[i]);
            cloudIdToLocalPath[existingCloudImages[i]] = existingPaths[i];
          } catch {
            // 本地文件不存在，忽略
          }
        }
      }

      // 3. 按云端顺序生成本地路径，只下载缺失的
      const localPaths: string[] = [];
      for (let i = 0; i < cloudImageIds.length; i++) {
        const cloudImageId = cloudImageIds[i];
        const existingLocalPath = cloudIdToLocalPath[cloudImageId];

        if (existingLocalPath) {
          // 本地已有，直接使用
          localPaths.push(existingLocalPath);
          console.log('[Detail] 使用已有图片:', i + 1, cloudImageId.split('/').pop());
        } else {
          // 需要下载
          wx.showLoading({ title: `下载中 ${i + 1}/${cloudImageIds.length}`, mask: true });
          console.log('[Detail] 下载新图片:', i + 1, cloudImageId.split('/').pop());
          const localPath = await this.downloadCloudImage(cloudImageId);
          localPaths.push(localPath);
        }
      }

      wx.hideLoading();

      // 3. 更新本地存储（关键：同时保存 cloudImages 保持顺序对应）
      const imageList = wx.getStorageSync('imageList') || [];
      const fileList = wx.getStorageSync('fileList') || [];
      const updatedImageList = imageList.map((img: any) => {
        if (img.id === id) {
          return { ...img, paths: localPaths, path: localPaths[0], cloudImages: cloudImageIds };
        }
        return img;
      });
      const updatedFileList = fileList.map((file: any) => {
        if (file.id === id) {
          return { ...file, paths: localPaths, path: localPaths[0], cloudImages: cloudImageIds };
        }
        return file;
      });
      wx.setStorageSync('imageList', updatedImageList);
      wx.setStorageSync('fileList', updatedFileList);

      // 4. 显示图片
      this.setData({
        itemType: item.type,
        itemName: name,
        itemPath: localPaths[0],
        itemPaths: localPaths,
        currentImageIndex: 0,
        totalImages: localPaths.length,
        scale: 1,
        translateX: 0,
        translateY: 0,
        swiperEnabled: true,
        imageSizes: {},
        isConverting: false,
      });

      wx.setNavigationBarTitle({ title: name });
      this.loadMemoContent();

    } catch (err: any) {
      wx.hideLoading();
      console.error('下载云端图片失败:', err);
      this.setData({ isConverting: false });
      this.showToast(err?.message || '加载失败');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  /**
   * 下载云存储图片到本地
   */
  async downloadCloudImage(fileId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID: fileId,
        success: (res) => {
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success: (saveRes) => resolve(saveRes.savedFilePath),
            fail: reject
          });
        },
        fail: reject
      });
    });
  },
});