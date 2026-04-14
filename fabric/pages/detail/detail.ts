// pages/detail/detail.ts
import { convertPdfToImages, continuePdfConversion, showLoading, hideLoading } from '../../utils/pdf_converter';
import { vibrate } from '../../utils/vibrate';

// 备忘录存储键
const MEMO_STORAGE_KEY = "itemMemos";
// 图片索引存储键
const LAST_IMAGE_INDEX_KEY = "lastImageIndex";
// 临时计数器新手引导是否已展示
const TEMP_COUNTER_TIPS_SHOWN_KEY = "tempCounterTipsShown";
// 标尺状态存储键
const RULER_STATE_KEY = "rulerState";

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
  isFirstShow: boolean;      // 是否首次 onShow（用于 getUserData 去重）
  pdfConvertProgress: string; // PDF转换进度文案（如 "3/10"），空串表示不显示

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
  // fab 收起状态
  isFabCollapsed: boolean;
  // fab 跟手拖拽
  isFabDragging: boolean;
  fabAnimStyle: string;
  // 标记工具栏
  showPaintToolbar: boolean;
  paintActiveTool: 'highlighter' | 'eraser' | 'ruler';
  paintSheetStyle: string;
  paintSheetClosing: boolean;
  hasHighlighterHistory: boolean; // 是否有荧光笔绘图历史（控制撤销/重做按钮是否可用）

  // ========== 标尺 ==========
  rulerVisible: boolean;        // 标尺是否可见
  rulerX: number;               // 中心X（预变换像素，容器中心为原点）
  rulerY: number;               // 中心Y（预变换像素，容器中心为原点）
  rulerAngle: number;           // 旋转角度（度）
  rulerLength: number;          // 长度（预变换 px）
  rulerThickness: number;       // 宽度/厚度（预变换 px）
  rulerIsEditMode: boolean;     // 是否处于编辑态
  rulerShowAngle: boolean;      // 是否显示角度（双指旋转时）
  rulerAngleDisplay: string;    // 角度显示文本
  rulerAngleScreenLeft: string; // 角度显示屏幕 left（px，相对 preview-area）
  rulerAngleScreenTop: string;  // 角度显示屏幕 top（px，相对 preview-area）
  rulerSideHandleLeft: number;  // 侧边手柄距离标尺左边缘的偏移（px，动态计算使其始终在可视区）
  rulerType: 'ticked' | 'plain'; // 标尺类型：有刻度 / 无刻度
  // 标尺类型切换 tip
  showRulerTypeTip: boolean;
  rulerTypeTipX: string;        // tip 中心 X（px，屏幕坐标）
  rulerTypeTipY: string;        // tip 底部 Y（px，屏幕坐标）

  // ========== 计数器-标尺联动 ==========
  rulerCounterLinked: boolean;   // 联动开关是否激活
  rulerAnimating: boolean;       // 标尺正在执行联动动画
  rulerLinkIconLeft: number;     // 联动 icon left（px，wrapper 本地坐标）
  rulerLinkIconTop: number;      // 联动 icon top（px，wrapper 本地坐标）
  rulerLinkIconFallback: boolean; // SVG 加载失败时显示文字 fallback
}

// 缩放范围常量
const MIN_SCALE = 1.0;
const MIN_SCALE_EDIT = 0.5; // 编辑态下允许进一步缩小
const MAX_SCALE = 6.0;
// 双击时间阈值
const DOUBLE_TAP_THRESHOLD = 300;

// 通用的提示配置
const DETAIL_TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1000,
};

Page<DetailPageData, WechatMiniprogram.IAnyObject>({
  // 内存缓存：已验证文件完整性的图解 { itemId: pathsKey }
  _verifiedFileItems: {} as Record<string, string>,

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
    isFirstShow: true,  // 标记是否首次 onShow
    pdfConvertProgress: '',
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
    isFabCollapsed: false,
    isFabDragging: false,
    fabAnimStyle: '',
    showPaintToolbar: false,
    paintActiveTool: 'highlighter',
    paintSheetStyle: '',
    paintSheetClosing: false,
    hasHighlighterHistory: false,
    rulerVisible: true,
    rulerX: 0,
    rulerY: 0,
    rulerAngle: 0,
    rulerLength: 300,
    rulerThickness: 60,
    rulerIsEditMode: false,
    rulerShowAngle: false,
    rulerAngleDisplay: '0°',
    rulerAngleScreenLeft: '0px',
    rulerAngleScreenTop: '0px',
    rulerSideHandleLeft: 0,
    rulerType: 'ticked',
    showRulerTypeTip: false,
    rulerTypeTipX: '',
    rulerTypeTipY: '',
    rulerCounterLinked: false,
    rulerAnimating: false,
    rulerLinkIconLeft: 0,
    rulerLinkIconTop: 0,
    rulerLinkIconFallback: false,
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

        // preserveIndex=true 表示 onShow 触发，且之前已成功加载过，跳过文件完整性检查
        // 每次重新读取 storage 中的 item 以检测 paths 变化（如同步后新增了图片）
        const pathsKey = paths.join(',');
        const skipFileCheck = preserveIndex && this._verifiedFileItems[id] === pathsKey;
        const hasValidPaths = skipFileCheck || (paths.length > 0 && this.checkLocalFilesExist(paths));

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

      // 标记该图解的文件已验证通过，后续 onShow 跳过磁盘检查
      if (item.syncStatus === 'synced') {
        this._verifiedFileItems[id] = (item.paths || []).join(',');
      }

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
    showLoading('加载中...');

    try {
      // 转换PDF为图片
      const result = await convertPdfToImages(path, id, (progress) => {
        // 仅在页面可见时更新
        if (!this.data.isPageHidden) {
          // 第一页下载完成后立即显示图片，让用户能边加载边看
          if (progress.current === 1) {
            hideLoading();
            this.setData({
              itemType: 'pdf',
              itemName: name,
              itemPath: progress.paths[0],
              itemPaths: progress.paths,
              currentImageIndex: 0,
              totalImages: progress.paths.length,
              scale: 1,
              translateX: 0,
              translateY: 0,
              swiperEnabled: true,
              imageSizes: {},
              pdfConvertProgress: `${progress.current}/${progress.total}`,
            });
            wx.setNavigationBarTitle({ title: name });
            this.loadMemoContent();
          } else {
            this.setData({
              itemPaths: progress.paths,
              totalImages: progress.paths.length,
              pdfConvertProgress: `${progress.current}/${progress.total}`,
            });
          }
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
        // 显示转换后的图片（保留用户当前浏览位置）
        const itemPaths = result.paths;
        const totalImages = itemPaths.length;
        const preserveIndex = Math.min(this.data.currentImageIndex, totalImages - 1);
        const { scale, translateX, translateY } = this.data;

        this.setData({
          itemType: 'pdf',
          itemName: name,
          itemPath: itemPaths[preserveIndex],
          itemPaths,
          currentImageIndex: preserveIndex,
          totalImages,
          scale,
          translateX,
          translateY,
          swiperEnabled: scale <= 1,
          imageSizes: {},
          isConverting: false,
          pdfConvertProgress: '',
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
        this.setData({ isConverting: false, pdfConvertProgress: '' });
      }
    } catch (err: any) {
      hideLoading();
      console.error('PDF转换失败:', err);
      this.setData({ isConverting: false, pdfConvertProgress: '' });
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
      pdfConvertProgress: `${paths.length}/${totalPdfPageCount}`,
    });
    wx.setNavigationBarTitle({ title: name });
    this.loadMemoContent();

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
              pdfConvertProgress: `${progress.current}/${progress.total}`,
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
        const preserveIndex = Math.min(this.data.currentImageIndex, totalImages - 1);
        const { scale, translateX, translateY } = this.data;

        this.setData({
          itemType: 'pdf',
          itemName: name,
          itemPath: itemPaths[preserveIndex],
          itemPaths,
          currentImageIndex: preserveIndex,
          totalImages,
          scale,
          translateX,
          translateY,
          swiperEnabled: scale <= 1,
          imageSizes: {},
          isConverting: false,
          pdfConvertProgress: '',
        });

        wx.setNavigationBarTitle({ title: name });
        this.loadMemoContent();

        if (result.isComplete) {
          this.showToast(`完成啦！共有${result.pageCount}页`);
        } else {
          this.showToast(`已加载 ${result.pageCount}/${totalPdfPageCount} 页`);
        }
      } else {
        this.setData({ isConverting: false, pdfConvertProgress: '' });
      }
    } catch (err: any) {
      hideLoading();
      console.error('继续加载PDF失败:', err);
      this.setData({ isConverting: false, pdfConvertProgress: '' });
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

    // 日志：图解名称 + 当前图片文件大小
    const currentPath = this.data.itemPaths[index];
    if (currentPath) {
      try {
        const fs = wx.getFileSystemManager();
        const stat = fs.statSync(currentPath);
        const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
        console.log(`[Detail] 图解: ${this.data.itemName}, 图片 ${index + 1}/${this.data.totalImages}, 大小: ${sizeMB}MB, 路径: ${currentPath}`);
      } catch (err) {
        console.log(`[Detail] 图解: ${this.data.itemName}, 图片 ${index + 1}/${this.data.totalImages}, 获取文件大小失败`);
      }
    }
  },

  /**
   * 获取预览容器尺寸
   */
  getContainerSize() {
    const query = wx.createSelectorQuery();
    query.select('.preview-area').boundingClientRect((rect: any) => {
      if (rect) {
        const updateData: Record<string, any> = {
          containerWidth: rect.width,
          containerHeight: rect.height,
        };
        // 容器尺寸已知后，确保标尺长度足够
        if (this.data.rulerVisible && this.data.rulerLength < this._getMinRulerLength()) {
          updateData.rulerLength = this._getMinRulerLength();
        }
        // 容器尺寸已知后，重新计算联动 icon 位置
        if (this.data.rulerVisible) {
          const iconPos = this._computeLinkIconLocal();
          updateData.rulerLinkIconLeft = iconPos.left;
          updateData.rulerLinkIconTop = iconPos.top;
        }
        this.setData(updateData);
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
    // 编辑态下禁止图片手势（标尺编辑优先）
    if (this.data.rulerIsEditMode) return;

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
              const zoomUpdate: Record<string, any> = { scale: 2.0 };
              if (this.data.rulerVisible) {
                const { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, containerWidth, containerHeight } = this.data;
                const iconPos = this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, 2.0, containerWidth, containerHeight, 0, 0);
                zoomUpdate.rulerLinkIconLeft = iconPos.left;
                zoomUpdate.rulerLinkIconTop = iconPos.top;
              }
              this.setData(zoomUpdate);
              setTimeout(() => this.setData({ isAnimating: false }), 300);
            });
          } else {
            // 缩小：直接动画回 scale=1，动画结束后 hidden 生效
            const shrinkUpdate: Record<string, any> = { scale: 1, translateX: 0, translateY: 0, isAnimating: true };
            if (this.data.rulerVisible) {
              const { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, containerWidth, containerHeight } = this.data;
              const iconPos = this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, 1, containerWidth, containerHeight, 0, 0);
              shrinkUpdate.rulerLinkIconLeft = iconPos.left;
              shrinkUpdate.rulerLinkIconTop = iconPos.top;
            }
            this.setData(shrinkUpdate);
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

    // 硬限制缩放范围，编辑态允许更小缩放
    const minScale = this.data.rulerIsEditMode ? MIN_SCALE_EDIT : MIN_SCALE;
    newScale = Math.max(minScale, Math.min(newScale, MAX_SCALE));

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
      const maxTX = Math.abs(displayWidth * newScale - containerWidth) / 2;
      const maxTY = Math.abs(displayHeight * newScale - containerHeight) / 2;
      newTranslateX = Math.max(-maxTX, Math.min(newTranslateX, maxTX));
      newTranslateY = Math.max(-maxTY, Math.min(newTranslateY, maxTY));
    }

    this.setData({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
      lastScaleCenterX: currentCenter.x,
      lastScaleCenterY: currentCenter.y,
      swiperEnabled: newScale <= 1,
    });
    // 联动 icon 位置在 touchEnd → springBack 时统一更新，避免每帧 setData 导致卡顿

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
  // fab 滑动检测起始坐标
  _fabTouchStartX: 0,
  _fabTouchStartY: 0,
  // fab 跟手拖拽状态
  _fabDragStarted: false,
  _fabCurrentOffset: 0,
  _fabWidth: 0,
  // 标记工具栏下滑关闭检测
  _sheetTouchStartY: 0,
  _sheetIsDragging: false,
  _sheetDragStarted: false,
  _sheetCurrentOffset: 0,
  // 标尺触摸临时状态
  _rulerHandleType: null as 'body' | 'endLeft' | 'endRight' | 'side' | 'bodyRotate' | null,
  _rulerDragOffsetX: 0,      // 触摸点相对标尺中心的偏移（屏幕坐标）
  _rulerDragOffsetY: 0,
  _rulerDidDrag: false,
  _rulerInitialLength: 0,
  _rulerInitialThickness: 0,
  _rulerInitialAngle: 0,
  _rulerTouchStartAngle: 0,  // 双指旋转开始时两指连线角度（弧度）
  _rulerTouchStartX: 0,      // handle 触摸起始点
  _rulerTouchStartY: 0,
  _rulerRotatePivotX: 0,     // 双指旋转中心（预变换坐标，相对容器中心）
  _rulerRotatePivotY: 0,
  _rulerRotateInitRulerX: 0, // 旋转开始时标尺中心位置
  _rulerRotateInitRulerY: 0,
  _rulerAngleLocalOffset: 0, // 旋转开始时角度标签在标尺轴上的本地偏移（相对标尺中心，预变换 px）
  // 端点手柄固定端（用于拖动时不依赖 stale data）
  _rulerFixedEndX: 0,
  _rulerFixedEndY: 0,
  // 侧边手柄：触摸增量追踪
  _rulerSideStartTouchX: 0,
  _rulerSideStartTouchY: 0,
  _rulerSideNormalX: 0,
  _rulerSideNormalY: 0,
  _rulerSideScale: 1,
  _rulerSideSign: 1,           // +1 = 下侧手柄, -1 = 上侧手柄

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

    // 最大位移 = |显示尺寸 * 缩放 - 容器尺寸| / 2
    // 使用 Math.abs：当缩放图片小于容器时（平板宽屏+竖图），仍允许在容器内拖动
    const maxTranslateX = Math.abs(displayWidth * scale - containerWidth) / 2;
    const maxTranslateY = Math.abs(displayHeight * scale - containerHeight) / 2;

    // 目标位移，限制在边界内
    const newTranslateX = Math.max(-maxTranslateX, Math.min(this.data.initialTranslateX + deltaX, maxTranslateX));
    const newTranslateY = Math.max(-maxTranslateY, Math.min(this.data.initialTranslateY + deltaY, maxTranslateY));

    this.setData({ translateX: newTranslateX, translateY: newTranslateY });
    // 联动 icon 位置在 touchEnd → springBack 时统一更新
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

    // 1. 缩放范围回弹（编辑态允许更小缩放）
    const minScale = this.data.rulerIsEditMode ? MIN_SCALE_EDIT : MIN_SCALE;
    if (scale < minScale) {
      targetScale = minScale;
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

      const maxTranslateX = Math.abs(displayWidth * targetScale - containerWidth) / 2;
      const maxTranslateY = Math.abs(displayHeight * targetScale - containerHeight) / 2;

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
      // 统一恢复 swiperEnabled
      const resolvedSwiper = this._resolveSwiperEnabled();
      if (resolvedSwiper !== this.data.swiperEnabled) {
        this.setData({ swiperEnabled: resolvedSwiper });
      }
    }

    if (needsAnimation) {
      // 先启用 CSS transition，下一帧再改 transform，避免渲染引擎闪白
      this.setData({ isAnimating: true });
      wx.nextTick(() => {
        const updateData: Record<string, any> = {
          scale: targetScale,
          translateX: targetTranslateX,
          translateY: targetTranslateY,
        };
        if (this.data.rulerVisible) {
          const { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, containerWidth, containerHeight } = this.data;
          const iconPos = this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, targetScale, containerWidth, containerHeight, targetTranslateX, targetTranslateY);
          updateData.rulerLinkIconLeft = iconPos.left;
          updateData.rulerLinkIconTop = iconPos.top;
        }
        this.setData(updateData);
        setTimeout(() => {
          this.setData({ isAnimating: false, swiperEnabled: this._resolveSwiperEnabled() });
        }, 300);
      });
    } else if (this.data.rulerVisible) {
      // 无需动画但联动 icon 位置需同步（缩放/拖动过程中跳过了更新）
      const { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness } = this.data;
      const iconPos = this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, targetScale, containerWidth, containerHeight, targetTranslateX, targetTranslateY);
      this.setData({ rulerLinkIconLeft: iconPos.left, rulerLinkIconTop: iconPos.top });
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
    this.loadRulerState();
    // 开始针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      // 仅首次进入时同步云端数据，避免 onShow 每次重复调用 getUserData
      if (this.data.isFirstShow) {
        this.setData({ isFirstShow: false });
        app.syncFromCloud().catch(err => {
          console.error('[Detail] 同步云端数据失败:', err)
        })
      }
      app.startKnittingSession();

      // 已登录时启动图解心跳同步
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.isLoggedIn && this.data.itemId) {
        app.globalData.activeDiagramIds = [this.data.itemId];
        // app.startDiagramHeartbeat(); // 心跳同步已禁用
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
    this.saveRulerState();
    // 暂停针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      app.pauseKnittingSession(true);
      // 停止心跳并同步图解数据
      // app.stopDiagramHeartbeat(); // 心跳同步已禁用
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
    this.saveRulerState();
    // 暂停针织总时长计时
    const app = getApp<IAppOption>();
    if (app) {
      app.pauseKnittingSession(true);
      // 停止心跳并同步图解数据
      // app.stopDiagramHeartbeat(); // 心跳同步已禁用
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
    // 如果工具栏正在显示，先关闭工具栏并退出标尺编辑态
    if (this.data.showPaintToolbar) {
      this._closePaintToolbar();
      return;
    }
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
    const bottomMargin = 44; // 距屏幕底部 44dp
    const bottomY = sys.windowHeight - bottomMargin - counterHeightPx;
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

  /** 重置临时计数器为0 */
  onTempCounterReset(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id;
    const counters = this.data.tempCounters.map((c) =>
      c.id === id ? { ...c, count: 0 } : c
    );
    this.setData({ tempCounters: counters });
    this.saveTempCounters();
    this.showToast('已重置');
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

  // ========== 标尺状态持久化 ==========

  saveRulerState() {
    const { itemId, rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, rulerType, rulerCounterLinked } = this.data;
    if (!itemId) return;
    const storage = wx.getStorageSync(RULER_STATE_KEY) || {};
    storage[itemId] = { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, rulerType, rulerCounterLinked };
    wx.setStorageSync(RULER_STATE_KEY, storage);
  },

  loadRulerState() {
    const { itemId } = this.data;
    if (!itemId) return;
    const storage = wx.getStorageSync(RULER_STATE_KEY) || {};
    const state = storage[itemId];
    if (state) {
      const rx = state.rulerX ?? 0;
      const ry = state.rulerY ?? 0;
      const angle = state.rulerAngle ?? 0;
      const length = state.rulerLength ?? this._getMinRulerLength();
      const thickness = state.rulerThickness ?? 60;
      const { scale, containerWidth, containerHeight, translateX, translateY } = this.data;
      const iconPos = this._computeLinkIconLocalWith(rx, ry, angle, length, thickness, scale, containerWidth, containerHeight, translateX, translateY);
      this.setData({
        rulerX: rx,
        rulerY: ry,
        rulerAngle: angle,
        rulerLength: length,
        rulerThickness: thickness,
        rulerType: state.rulerType ?? 'ticked',
        rulerCounterLinked: state.rulerCounterLinked ?? false,
        rulerLinkIconLeft: iconPos.left,
        rulerLinkIconTop: iconPos.top,
      });
    } else {
      // 首次使用：设置默认长度
      const iconPos = this._computeLinkIconLocal();
      this.setData({
        rulerLength: this._getMinRulerLength(),
        rulerLinkIconLeft: iconPos.left,
        rulerLinkIconTop: iconPos.top,
      });
    }
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

  /** 关闭标记工具栏（退出编辑态 + 收起工具栏动画） */
  _closePaintToolbar() {
    if (this.data.paintSheetClosing) return;
    // 退出标尺编辑态
    if (this.data.rulerIsEditMode) {
      this.setData({
        rulerIsEditMode: false,
        swiperEnabled: this._resolveSwiperEnabled(),
      });
    }
    // 关闭工具栏动画
    this.setData({
      paintSheetClosing: true,
      paintSheetStyle: 'transform: translateY(100%); opacity: 0; transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease-in;',
    });
    setTimeout(() => {
      if (this.data.paintSheetClosing) {
        this.setData({ showPaintToolbar: false, paintSheetClosing: false, paintSheetStyle: '', showRulerTypeTip: false });
      }
    }, 350);
  },

  onMemoFabTap() {
    this.onMemoTap();
  },

  onPaintFabTap() {
    if (this.data.paintSheetClosing) return;
    if (this.data.showPaintToolbar) {
      this._closePaintToolbar();
    } else {
      // 入场：先定位到屏幕外，再动画滑入（与 FAB 展开一致的缓动）
      this.setData({
        showPaintToolbar: true,
        paintSheetClosing: false,
        paintSheetStyle: 'transform: translateY(100%); opacity: 0;',
      });
      setTimeout(() => {
        if (this.data.showPaintToolbar && !this.data.paintSheetClosing) {
          this.setData({
            paintSheetStyle: 'transform: translateY(0); opacity: 1; transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.05s, opacity 0.32s ease-out 0.05s;',
          });
        }
      }, 50);
    }
  },

  onPaintToolSelect(e: WechatMiniprogram.TapEvent) {
    const tool = e.currentTarget.dataset.tool as 'highlighter' | 'eraser' | 'ruler';
    if (tool === 'ruler') {
      const showRuler = !this.data.rulerVisible;
      const newLength = showRuler && this.data.rulerLength < this._getMinRulerLength()
        ? this._getMinRulerLength() : this.data.rulerLength;
      const iconPos = showRuler ? this._computeLinkIconLocalWith(
        this.data.rulerX, this.data.rulerY, this.data.rulerAngle, newLength,
        this.data.rulerThickness, this.data.scale, this.data.containerWidth, this.data.containerHeight,
        this.data.translateX, this.data.translateY
      ) : { left: this.data.rulerLinkIconLeft, top: this.data.rulerLinkIconTop };
      this.setData({
        rulerVisible: showRuler,
        paintActiveTool: 'ruler',
        ...(showRuler && this.data.rulerLength < this._getMinRulerLength()
          ? { rulerLength: this._getMinRulerLength() }
          : {}),
        ...(showRuler ? { rulerLinkIconLeft: iconPos.left, rulerLinkIconTop: iconPos.top } : {}),
      });
      // 选中→未选中切换动画：短暂激活后恢复
      setTimeout(() => {
        if (this.data.paintActiveTool === 'ruler') {
          this.setData({ paintActiveTool: 'highlighter' });
        }
      }, 250);
    } else {
      this.setData({ paintActiveTool: tool });
    }
  },

  onPaintUndo() {
    // 撤销（后续实现绘图功能时接入）
  },

  onPaintRedo() {
    // 重做（后续实现绘图功能时接入）
  },

  onPaintSheetTouchStart(e: WechatMiniprogram.TouchEvent) {
    this._sheetTouchStartY = e.touches[0].clientY;
    this._sheetIsDragging = false;
    this._sheetDragStarted = false;
    this._sheetCurrentOffset = 0;
  },

  onPaintSheetTouchMove(e: WechatMiniprogram.TouchEvent) {
    const dy = e.touches[0].clientY - this._sheetTouchStartY;

    // 向下拖动超过阈值才开始跟手（与 FAB 一致的方向判断）
    if (!this._sheetDragStarted) {
      if (dy > 8) {
        this._sheetDragStarted = true;
      } else {
        return;
      }
    }

    // 橡皮筋阻尼：超过 120px 后衰减为 0.2（与 FAB 一致）
    const rawOffset = Math.max(0, dy);
    const offset = rawOffset > 120 ? 120 + (rawOffset - 120) * 0.2 : rawOffset;
    const progress = Math.min(1, offset / 100);
    const opacity = 1 - progress * 0.4;

    this._sheetCurrentOffset = offset;
    this._sheetIsDragging = true;
    this.setData({
      paintSheetStyle: `transform: translateY(${offset}px); opacity: ${opacity}; transition: none;`,
    });
  },

  onPaintSheetTouchEnd(e: WechatMiniprogram.TouchEvent) {
    if (!this._sheetDragStarted) return;

    // 关闭阈值（与 FAB 类似：约半个工具栏高度 ≈ 60px）
    const shouldClose = this._sheetCurrentOffset > 60;

    if (shouldClose) {
      // 关闭动画（与 FAB 收起一致）
      this.setData({
        paintSheetClosing: true,
        paintSheetStyle: 'transform: translateY(100%); opacity: 0; transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease-in;',
      });
      setTimeout(() => {
        if (this.data.paintSheetClosing) {
          this.setData({ showPaintToolbar: false, paintSheetClosing: false, paintSheetStyle: '', showRulerTypeTip: false });
        }
      }, 350);
    } else {
      // 回弹（与 FAB 展开一致）
      this.setData({
        paintSheetStyle: 'transform: translateY(0); opacity: 1; transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.05s, opacity 0.32s ease-out 0.05s;',
      });
    }
    this._sheetIsDragging = false;
    this._sheetDragStarted = false;
    this._sheetCurrentOffset = 0;
  },

  onPaintSheetTransitionEnd() {
    if (this.data.paintSheetClosing) {
      this.setData({ showPaintToolbar: false, paintSheetClosing: false, paintSheetStyle: '', showRulerTypeTip: false });
    } else if (this.data.showPaintToolbar && !this._sheetIsDragging) {
      // 入场/回弹动画完成，清除 transition 确保拖拽即时响应
      this.setData({ paintSheetStyle: '' });
    }
  },

  // ========== 标尺事件处理 ==========

  /**
   * 标尺主体 touchstart：单指拖动 / 双指旋转 / 点击进入编辑态
   */
  onRulerBodyTouchStart(e: WechatMiniprogram.TouchEvent) {
    // 如果正在执行联动动画，立即停止动画以避免与拖动冲突
    if (this.data.rulerAnimating) {
      this.setData({ rulerAnimating: false });
    }

    const touches = e.touches;

    // 双指触摸标尺 → 进入旋转模式
    if (touches.length === 2) {
      const [t1, t2] = touches;
      const touchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
      const midScreenX = (t1.clientX + t2.clientX) / 2;
      const midScreenY = (t1.clientY + t2.clientY) / 2;
      const { scale, containerWidth, containerHeight, translateX, translateY, rulerX, rulerY, rulerAngle, rulerLength } = this.data;
      // 旋转中心 = 双指中点（转换为预变换坐标）
      this._rulerHandleType = 'bodyRotate';
      this._rulerInitialAngle = rulerAngle;
      this._rulerTouchStartAngle = touchAngle;
      this._rulerRotatePivotX = (midScreenX - containerWidth / 2 - translateX) / scale;
      this._rulerRotatePivotY = (midScreenY - containerHeight / 2 - translateY) / scale;
      this._rulerRotateInitRulerX = rulerX;
      this._rulerRotateInitRulerY = rulerY;
      this._rulerDidDrag = false;
      // 角度显示位置 = 标尺可视部分中心（preview-area 坐标），旋转期间保持同一本地位置
      const anglePos = this._computeRulerAnglePositionWith(rulerX, rulerY, rulerAngle, rulerLength, scale, containerWidth, containerHeight, translateX, translateY);
      this._rulerAngleLocalOffset = anglePos.localOffset;
      this.setData({
        rulerShowAngle: true,
        rulerAngleDisplay: this._formatRulerAngle(rulerAngle),
        rulerAngleScreenLeft: anglePos.left + 'px',
        rulerAngleScreenTop: anglePos.top + 'px',
      });
      return;
    }

    // 单指触摸 → 拖动
    const touch = touches[0];
    const { scale, containerWidth, containerHeight, translateX, translateY, rulerX, rulerY } = this.data;

    const centerScreenX = containerWidth / 2 + translateX + rulerX * scale;
    const centerScreenY = containerHeight / 2 + translateY + rulerY * scale;

    this._rulerHandleType = 'body';
    this._rulerDragOffsetX = touch.clientX - centerScreenX;
    this._rulerDragOffsetY = touch.clientY - centerScreenY;
    this._rulerDidDrag = false;
    this._rulerTouchStartX = touch.clientX;
    this._rulerTouchStartY = touch.clientY;
  },

  /**
   * 标尺手柄 touchstart：端点/侧边手柄
   */
  onRulerHandleTouchStart(e: WechatMiniprogram.TouchEvent) {
    const handle = e.currentTarget.dataset.handle as 'endLeft' | 'endRight' | 'side';
    const touch = e.touches[0];
    const { rulerAngle, rulerLength, rulerThickness, rulerX, rulerY } = this.data;

    this._rulerHandleType = handle;
    this._rulerTouchStartX = touch.clientX;
    this._rulerTouchStartY = touch.clientY;
    this._rulerInitialLength = rulerLength;
    this._rulerInitialThickness = rulerThickness;
    this._rulerInitialAngle = rulerAngle;
    this._rulerDidDrag = false;

    // 端点手柄：记录对侧固定端位置
    const angleRad = rulerAngle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    if (handle === 'endRight') {
      // 左端固定
      this._rulerFixedEndX = rulerX - (rulerLength / 2) * cosA;
      this._rulerFixedEndY = rulerY - (rulerLength / 2) * sinA;
    } else if (handle === 'endLeft') {
      // 右端固定
      this._rulerFixedEndX = rulerX + (rulerLength / 2) * cosA;
      this._rulerFixedEndY = rulerY + (rulerLength / 2) * sinA;
    } else if (handle === 'sideTop' || handle === 'sideBottom') {
      // 侧边手柄：记录初始触摸位置 + 法线方向 + 上下标识
      const angleRad = rulerAngle * Math.PI / 180;
      this._rulerSideNormalX = -Math.sin(angleRad);
      this._rulerSideNormalY = Math.cos(angleRad);
      this._rulerSideScale = this.data.scale;
      this._rulerSideStartTouchX = touch.clientX;
      this._rulerSideStartTouchY = touch.clientY;
      // 上侧手柄法线方向反转（远离中心 = 负法线方向）
      this._rulerSideSign = handle === 'sideBottom' ? 1 : -1;
    }
  },

  /**
   * 标尺 touchmove：分发到对应手柄处理方法
   */
  onRulerTouchMove(e: WechatMiniprogram.TouchEvent) {
    const handle = this._rulerHandleType;
    if (!handle) return;

    if (handle === 'body') {
      this._handleRulerBodyDrag(e);
    } else if (handle === 'endLeft' || handle === 'endRight') {
      this._handleRulerEndDrag(e);
    } else if (handle === 'sideTop' || handle === 'sideBottom') {
      this._handleRulerSideDrag(e);
    } else if (handle === 'bodyRotate') {
      this._handleRulerRotate(e);
    }
  },

  /**
   * 标尺主体拖动
   */
  _handleRulerBodyDrag(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];
    const { scale, containerWidth, containerHeight, translateX, translateY, rulerAngle, rulerLength, rulerIsEditMode } = this.data;

    // 直接从触摸位置计算标尺中心（不依赖 stale data）
    const newCenterScreenX = touch.clientX - this._rulerDragOffsetX;
    const newCenterScreenY = touch.clientY - this._rulerDragOffsetY;
    const newRulerX = (newCenterScreenX - containerWidth / 2 - translateX) / scale;
    const newRulerY = (newCenterScreenY - containerHeight / 2 - translateY) / scale;

    const updateData: Record<string, any> = { rulerX: newRulerX, rulerY: newRulerY };
    // 编辑态下同步更新侧边手柄位置
    if (rulerIsEditMode) {
      updateData.rulerSideHandleLeft = this._computeSideHandleLeftWith(
        newRulerX, newRulerY, rulerAngle, rulerLength, scale, containerWidth, containerHeight, translateX, translateY
      );
    }
    // 同步更新联动 icon 位置
    const iconPos = this._computeLinkIconLocalWith(
      newRulerX, newRulerY, rulerAngle, rulerLength, this.data.rulerThickness, scale, containerWidth, containerHeight, translateX, translateY
    );
    updateData.rulerLinkIconLeft = iconPos.left;
    updateData.rulerLinkIconTop = iconPos.top;
    this.setData(updateData);

    const dx = touch.clientX - this._rulerTouchStartX;
    const dy = touch.clientY - this._rulerTouchStartY;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      this._rulerDidDrag = true;
    }
  },

  /**
   * 端点手柄拖动（左端/右端）
   */
  _handleRulerEndDrag(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];
    const { scale, containerWidth, containerHeight, translateX, translateY, rulerAngle, rulerThickness } = this.data;
    const handle = this._rulerHandleType!;

    const angleRad = rulerAngle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // 触摸点在预变换坐标系中的位置
    const touchPreX = (touch.clientX - containerWidth / 2 - translateX) / scale;
    const touchPreY = (touch.clientY - containerHeight / 2 - translateY) / scale;

    // 触摸点相对于固定端的投影
    const dx = touchPreX - this._rulerFixedEndX;
    const dy = touchPreY - this._rulerFixedEndY;
    const projOnAxis = dx * cosA + dy * sinA;

    const minLen = this._getMinRulerLength();

    if (handle === 'endRight') {
      // 右端拖动：固定左端，新长度 = 投影距离
      if (projOnAxis > minLen) {
        const newRulerX = this._rulerFixedEndX + (projOnAxis / 2) * cosA;
        const newRulerY = this._rulerFixedEndY + (projOnAxis / 2) * sinA;
        const iconPos = this._computeLinkIconLocalWith(newRulerX, newRulerY, rulerAngle, projOnAxis, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY);
        this.setData({ rulerLength: projOnAxis, rulerX: newRulerX, rulerY: newRulerY, rulerLinkIconLeft: iconPos.left, rulerLinkIconTop: iconPos.top });
      }
    } else {
      // 左端拖动：固定右端，投影取反
      const newLength = -projOnAxis;
      if (newLength > minLen) {
        const newRulerX = this._rulerFixedEndX - (newLength / 2) * cosA;
        const newRulerY = this._rulerFixedEndY - (newLength / 2) * sinA;
        const iconPos = this._computeLinkIconLocalWith(newRulerX, newRulerY, rulerAngle, newLength, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY);
        this.setData({ rulerLength: newLength, rulerX: newRulerX, rulerY: newRulerY, rulerLinkIconLeft: iconPos.left, rulerLinkIconTop: iconPos.top });
      }
    }
    this._rulerDidDrag = true;
  },

  /**
   * 侧边手柄拖动（上侧/下侧：调整厚度）
   */
  _handleRulerSideDrag(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];
    const { scale, containerWidth, containerHeight, translateX, translateY, rulerX, rulerY, rulerAngle, rulerLength } = this.data;

    // 触摸增量投影到法线方向，用 sign 统一上下方向
    // 远离标尺 → 变厚，靠近标尺 → 变薄
    const deltaX = touch.clientX - this._rulerSideStartTouchX;
    const deltaY = touch.clientY - this._rulerSideStartTouchY;
    const projDelta = deltaX * this._rulerSideNormalX + deltaY * this._rulerSideNormalY;
    const thicknessDelta = (projDelta * this._rulerSideSign) / this._rulerSideScale;
    const newThickness = Math.max(16, Math.min(400, this._rulerInitialThickness + thicknessDelta));
    const iconPos = this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, newThickness, scale, containerWidth, containerHeight, translateX, translateY);
    this.setData({ rulerThickness: newThickness, rulerLinkIconLeft: iconPos.left, rulerLinkIconTop: iconPos.top });
    this._rulerDidDrag = true;
  },

  /**
   * 双指旋转标尺
   */
  _handleRulerRotate(e: WechatMiniprogram.TouchEvent) {
    const touches = e.touches;
    if (touches.length < 2) return;

    const { scale, containerWidth, containerHeight, translateX, translateY, rulerLength, rulerThickness } = this.data;
    const [t1, t2] = touches;
    const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
    const angleDeltaDeg = (currentAngle - this._rulerTouchStartAngle) * 180 / Math.PI;
    let newAngle = this._rulerInitialAngle + angleDeltaDeg;
    // 吸边：靠近 0°/90° 时自动吸附
    newAngle = this._snapRulerAngle(newAngle);

    // 围绕双指中点旋转：调整标尺中心位置使旋转中心固定
    const actualDeltaRad = (newAngle - this._rulerInitialAngle) * Math.PI / 180;
    const cosD = Math.cos(actualDeltaRad);
    const sinD = Math.sin(actualDeltaRad);
    const dx = this._rulerRotateInitRulerX - this._rulerRotatePivotX;
    const dy = this._rulerRotateInitRulerY - this._rulerRotatePivotY;
    const newRulerX = this._rulerRotatePivotX + dx * cosD - dy * sinD;
    const newRulerY = this._rulerRotatePivotY + dx * sinD + dy * cosD;

    const iconPos = this._computeLinkIconLocalWith(newRulerX, newRulerY, newAngle, rulerLength, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY);
    // 角度标签：使用旋转开始时确定的本地偏移，跟随标尺移动，无需重新裁剪
    const anglePos = this._computeAnglePosFromLocalOffset(newRulerX, newRulerY, newAngle, this._rulerAngleLocalOffset, scale, containerWidth, containerHeight, translateX, translateY);
    this.setData({
      rulerAngle: newAngle,
      rulerX: newRulerX,
      rulerY: newRulerY,
      rulerAngleDisplay: this._formatRulerAngle(newAngle),
      rulerAngleScreenLeft: anglePos.left + 'px',
      rulerAngleScreenTop: anglePos.top + 'px',
      rulerLinkIconLeft: iconPos.left,
      rulerLinkIconTop: iconPos.top,
    });
    this._rulerDidDrag = true;
  },

  /**
   * 标尺 touchend：旋转结束隐藏角度 / 无拖动则进入/退出编辑态
   */
  onRulerTouchEnd() {
    if (this._rulerHandleType === 'bodyRotate') {
      // 双指旋转结束，最终吸边并隐藏角度
      const snappedAngle = this._snapRulerAngle(this.data.rulerAngle);
      this.setData({
        rulerAngle: snappedAngle,
        rulerShowAngle: false,
      });
      this._rulerHandleType = null;
      this._rulerDidDrag = false;
      return;
    }
    if (this._rulerHandleType === 'body' && !this._rulerDidDrag) {
      // tap：切换编辑态
      const entering = !this.data.rulerIsEditMode;
      this.setData({
        rulerIsEditMode: entering,
        swiperEnabled: this._resolveSwiperEnabled(),
        // 进入编辑态时计算侧边手柄位置
        ...(entering ? { rulerSideHandleLeft: this._computeSideHandleLeft() } : {}),
      });
    }
    this._rulerHandleType = null;
    this._rulerDidDrag = false;
  },

  /** 长按标尺工具图标：已激活时显示刻度类型切换，未激活时视为单击（开启标尺） */
  onRulerToolLongPress() {
    if (this.data.rulerVisible) {
      // 标尺已激活：显示类型切换 Tips
      const query = wx.createSelectorQuery();
      query.select('.paint-tool-ruler').boundingClientRect((rect: any) => {
        if (rect) {
          this.setData({
            showRulerTypeTip: true,
            rulerTypeTipX: (rect.left + rect.width / 2) + 'px',
            rulerTypeTipY: (rect.top - 10) + 'px',
          });
        }
      }).exec();
    } else {
      // 标尺未激活：视为单击，开启标尺
      const showRuler = true;
      this.setData({
        rulerVisible: showRuler,
        paintActiveTool: 'ruler',
        ...(showRuler && this.data.rulerLength < this._getMinRulerLength()
          ? { rulerLength: this._getMinRulerLength() }
          : {}),
      });
      setTimeout(() => {
        if (this.data.paintActiveTool === 'ruler') {
          this.setData({ paintActiveTool: 'highlighter' });
        }
      }, 250);
    }
  },

  /** 选择标尺类型（选完后自动关闭 Tips，保留工具栏） */
  onRulerTypeSelect(e: WechatMiniprogram.CustomEvent) {
    const type = e.currentTarget.dataset.type as 'ticked' | 'plain';
    if (this.data.rulerType !== type) {
      this.setData({ rulerType: type });
      this.saveRulerState();
    }
    this.setData({ showRulerTypeTip: false });
  },

  /** 点击 Tips 外部关闭（同时关闭工具栏，避免需两次点击） */
  onRulerTypeTipDismiss() {
    this.setData({ showRulerTypeTip: false });
    this._closePaintToolbar();
  },

  /**
   * 点击标尺外区域退出编辑态
   */
  onRulerExitEditMode() {
    this.setData({
      rulerIsEditMode: false,
      swiperEnabled: this._resolveSwiperEnabled(),
    });
  },

  /**
   * 重置标尺到初始状态
   */
  onRulerReset() {
    this.setData({
      rulerX: 0,
      rulerY: 0,
      rulerAngle: 0,
      rulerLength: this._getMinRulerLength(),
      rulerThickness: 60,
    });
  },

  /** 统一计算 swiperEnabled：编辑态禁用，否则看 scale */
  _resolveSwiperEnabled(): boolean {
    if (this.data.rulerVisible && this.data.rulerIsEditMode) return false;
    return this.data.scale <= 1;
  },

  /** 角度吸边：靠近 0°/90° 倍数时自动吸附（阈值 5°） */
  _snapRulerAngle(angle: number): number {
    const threshold = 5;
    const nearest = Math.round(angle / 90) * 90;
    if (Math.abs(angle - nearest) < threshold) {
      return nearest;
    }
    return angle;
  },

  /** 角度格式化：将任意角度归一化到 [0°, 90°] 显示 */
  _formatRulerAngle(angle: number): string {
    let a = ((angle % 180) + 180) % 180;
    if (a > 90) a = 180 - a;
    return `${Math.round(a)}°`;
  },

  /** 标尺最小长度 = 容器对角线 × 8（确保两端远超可视区，拖动时永远看不到边界） */
  _getMinRulerLength(): number {
    const { containerWidth, containerHeight } = this.data;
    if (!containerWidth || !containerHeight) return 500;
    return Math.sqrt(containerWidth * containerWidth + containerHeight * containerHeight) * 8;
  },

  /** 计算侧边手柄在标尺上的位置（距左边缘 px），使其始终在可视区中心附近 */
  _computeSideHandleLeft(): number {
    const { rulerX, rulerY, rulerAngle, rulerLength, scale, containerWidth, containerHeight, translateX, translateY } = this.data;
    return this._computeSideHandleLeftWith(rulerX, rulerY, rulerAngle, rulerLength, scale, containerWidth, containerHeight, translateX, translateY);
  },

  /** 带参数版本，避免在 setData 前读到 stale data */
  _computeSideHandleLeftWith(rx: number, ry: number, angle: number, length: number, sc: number, cw: number, ch: number, tx: number, ty: number): number {
    if (!cw || !ch) return length / 2;
    const angleRad = angle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const halfLen = length / 2;
    // 标尺两端转换到屏幕坐标
    // CSS transform-origin 默认 center，公式：screenX = cw/2 + (layerX - cw/2)*sc + tx
    // layerX = cw/2 + rx ± halfLen*cosA，化简后：
    const startScreenX = cw / 2 + (rx - halfLen * cosA) * sc + tx;
    const startScreenY = ch / 2 + (ry - halfLen * sinA) * sc + ty;
    const endScreenX   = cw / 2 + (rx + halfLen * cosA) * sc + tx;
    const endScreenY   = ch / 2 + (ry + halfLen * sinA) * sc + ty;
    // 参数化裁剪：将标尺线段裁剪到视口 [0, cw] x [0, ch]
    let tMin = 0, tMax = 1;
    const dsx = endScreenX - startScreenX;
    const dsy = endScreenY - startScreenY;
    const clip = (p: number, q: number) => {
      if (Math.abs(p) < 0.001) return q >= 0; // 平行于边：完全在内则跳过
      const t = q / p;
      if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
      else        { if (t < tMin) return false; if (t < tMax) tMax = t; }
      return true;
    };
    const inside =
      clip(-dsx, startScreenX) &&
      clip( dsx, cw - startScreenX) &&
      clip(-dsy, startScreenY) &&
      clip( dsy, ch - startScreenY);
    if (!inside || tMin >= tMax) return length / 2; // 标尺完全在视口外
    // 可视线段的中点参数 → 换算到标尺本地坐标（0 = 左端，length = 右端）
    const tMid = (tMin + tMax) / 2;
    return Math.max(100, Math.min(length - 100, tMid * length));
  },

  /**
   * 计算旋转角度标签在 preview-area 中的初始位置（px），定位在标尺可视部分中央。
   * 同时返回标尺轴本地偏移（localOffset），供后续旋转帧跟踪同一位置。
   */
  _computeRulerAnglePositionWith(rx: number, ry: number, angle: number, length: number, sc: number, cw: number, ch: number, tx: number, ty: number): { left: number; top: number; localOffset: number } {
    if (!cw || !ch) return { left: cw / 2, top: ch / 2, localOffset: 0 };
    const angleRad = angle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const halfLen = length / 2;
    const startScreenX = cw / 2 + (rx - halfLen * cosA) * sc + tx;
    const startScreenY = ch / 2 + (ry - halfLen * sinA) * sc + ty;
    const endScreenX   = cw / 2 + (rx + halfLen * cosA) * sc + tx;
    const endScreenY   = ch / 2 + (ry + halfLen * sinA) * sc + ty;
    let tMin = 0, tMax = 1;
    const dsx = endScreenX - startScreenX;
    const dsy = endScreenY - startScreenY;
    const clip = (p: number, q: number) => {
      if (Math.abs(p) < 0.001) return q >= 0;
      const t = q / p;
      if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
      else        { if (t < tMin) return false; if (t < tMax) tMax = t; }
      return true;
    };
    const inside =
      clip(-dsx, startScreenX) &&
      clip( dsx, cw - startScreenX) &&
      clip(-dsy, startScreenY) &&
      clip( dsy, ch - startScreenY);
    if (!inside || tMin >= tMax) return { left: cw / 2, top: ch / 2, localOffset: 0 };
    const tMid = (tMin + tMax) / 2;
    // localOffset：标尺轴上相对中心的偏移（tMid=0.5 → offset=0，即标尺正中心）
    const localOffset = (tMid - 0.5) * length;
    return {
      left: startScreenX + tMid * dsx,
      top:  startScreenY + tMid * dsy,
      localOffset,
    };
  },

  /**
   * 根据旋转开始时确定的标尺轴本地偏移，计算当前帧的角度标签屏幕位置。
   * 仅做直线映射，无 Liang-Barsky，性能开销极小。
   */
  _computeAnglePosFromLocalOffset(rx: number, ry: number, angle: number, localOffset: number, sc: number, cw: number, ch: number, tx: number, ty: number): { left: number; top: number } {
    const angleRad = angle * Math.PI / 180;
    return {
      left: cw / 2 + (rx + localOffset * Math.cos(angleRad)) * sc + tx,
      top:  ch / 2 + (ry + localOffset * Math.sin(angleRad)) * sc + ty,
    };
  },

  /** 计算联动 icon 在 wrapper 本地坐标系中的位置（px），定位到标尺右上角并限制在可视区内 */
  _computeLinkIconLocal(): { left: number, top: number } {
    const { rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY } = this.data;
    return this._computeLinkIconLocalWith(rulerX, rulerY, rulerAngle, rulerLength, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY);
  },

  /** 带参数版本 */
  _computeLinkIconLocalWith(rx: number, ry: number, angle: number, length: number, thickness: number, sc: number, cw: number, ch: number, tx: number, ty: number): { left: number, top: number } {
    if (!cw || !ch) return { left: length, top: 0 };
    const angleRad = angle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    // 标尺中心在变换层坐标
    const rcX = cw / 2 + rx;
    const rcY = ch / 2 + ry;
    const halfLen = length / 2;
    const halfThk = thickness / 2;
    // 右上角在变换层坐标（local: halfLen, -halfThk）
    const cornerX = rcX + halfLen * cosA + halfThk * sinA;
    const cornerY = rcY + halfLen * sinA - halfThk * cosA;
    // 可视区边界（变换层坐标）
    const vpLeft = -tx / sc;
    const vpTop = -ty / sc;
    const vpRight = (cw - tx) / sc;
    const vpBottom = (ch - ty) / sc;
    const pad = 20 / sc; // 屏幕边缘留白（变换层 px）
    // 限制在可视区内
    const clampedX = Math.max(vpLeft + pad, Math.min(vpRight - pad, cornerX));
    const clampedY = Math.max(vpTop + pad, Math.min(vpBottom - pad, cornerY));
    // 反旋转回 wrapper 本地坐标
    const dx = clampedX - rcX;
    const dy = clampedY - rcY;
    const localLeft = halfLen + dx * cosA + dy * sinA;
    const localTop = halfThk + (-dx * sinA + dy * cosA);
    return { left: localLeft, top: localTop };
  },

  // ========== 计数器-标尺联动 ==========

  /**
   * 切换计数器-标尺联动开关
   */
  onRulerLinkToggle() {
    const newLinked = !this.data.rulerCounterLinked;
    this.setData({ rulerCounterLinked: newLinked });
    this.saveRulerState();
    this.showToast(newLinked ? '计数联动已开启' : '计数联动已关闭');
  },

  /** 联动 icon SVG 加载失败时切换为文字 fallback */
  onRulerLinkIconError() {
    this.setData({ rulerLinkIconFallback: true });
  },

  /**
   * 沿标尺垂直方向移动一个 rulerThickness（带动画）
   * direction: 1 = "下"（正法线方向）, -1 = "上"（负法线方向）
   */
  _moveRulerPerpendicular(direction: 1 | -1) {
    const { rulerAngle, rulerThickness, rulerX, rulerY, rulerLength, scale, containerWidth, containerHeight, translateX, translateY } = this.data;
    const angleRad = rulerAngle * Math.PI / 180;
    // 垂直"下"方向: (-sin(θ), cos(θ))，乘以 direction 和 thickness
    const dx = -Math.sin(angleRad) * rulerThickness * direction;
    const dy = Math.cos(angleRad) * rulerThickness * direction;
    const newRulerX = rulerX + dx;
    const newRulerY = rulerY + dy;

    const iconPos = this._computeLinkIconLocalWith(newRulerX, newRulerY, rulerAngle, rulerLength, rulerThickness, scale, containerWidth, containerHeight, translateX, translateY);

    this.setData({ rulerAnimating: true });
    wx.nextTick(() => {
      this.setData({
        rulerX: newRulerX,
        rulerY: newRulerY,
        rulerLinkIconLeft: iconPos.left,
        rulerLinkIconTop: iconPos.top,
      });
      setTimeout(() => {
        this.setData({ rulerAnimating: false });
        this.saveRulerState();
      }, 300);
    });
  },

  /**
   * 计数器 +1 事件：标尺向下移动一个厚度
   */
  onCounterIncrease() {
    if (!this.data.rulerCounterLinked || this.data.rulerAnimating) return;
    this._moveRulerPerpendicular(1);
  },

  /**
   * 计数器 -1 事件：标尺向上移动一个厚度
   */
  onCounterDecrease() {
    if (!this.data.rulerCounterLinked || this.data.rulerAnimating) return;
    this._moveRulerPerpendicular(-1);
  },

  /**
   * 计数器 ↑ 按钮事件：标尺向上移动一个厚度（计数不变）
   */
  onCounterUp() {
    if (!this.data.rulerCounterLinked || this.data.rulerAnimating) return;
    this._moveRulerPerpendicular(-1);
  },

  /**
   * 计数器 ↓ 按钮事件：标尺向下移动一个厚度（计数不变）
   */
  onCounterDown() {
    if (!this.data.rulerCounterLinked || this.data.rulerAnimating) return;
    this._moveRulerPerpendicular(1);
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
    // if (app) app.resetDiagramHeartbeat(); // 心跳同步已禁用
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

      // 3. 渐进式下载：第 1 张可用图片立即显示，后续增量追加
      const localPaths: string[] = [];
      let firstImageShown = false;
      let failedCount = 0;

      for (let i = 0; i < cloudImageIds.length; i++) {
        const cloudImageId = cloudImageIds[i];
        const existingLocalPath = cloudIdToLocalPath[cloudImageId];

        if (existingLocalPath) {
          // 本地已有，直接使用
          localPaths.push(existingLocalPath);
          console.log('[Detail] 使用已有图片:', i + 1, cloudImageId.split('/').pop());
        } else {
          // 需要下载
          console.log('[Detail] 下载新图片:', i + 1, cloudImageId.split('/').pop());
          try {
            const localPath = await this.downloadCloudImage(cloudImageId);
            localPaths.push(localPath);
          } catch (downloadErr) {
            failedCount++;
            localPaths.push(''); // 占位，保持索引对齐
            console.warn('[Detail] 图片下载失败:', i + 1, downloadErr);
            continue;
          }
        }

        if (this.data.isPageHidden) continue;

        // 第 1 张可用图片时立即显示
        const validPaths = localPaths.filter((p: string) => p);
        if (!firstImageShown && validPaths.length >= 1) {
          firstImageShown = true;
          wx.hideLoading();
          this.setData({
            itemType: item.type,
            itemName: name,
            itemPath: validPaths[0],
            itemPaths: validPaths,
            currentImageIndex: 0,
            totalImages: validPaths.length,
            scale: 1,
            translateX: 0,
            translateY: 0,
            swiperEnabled: true,
            imageSizes: {},
            pdfConvertProgress: `${i + 1}/${cloudImageIds.length}`,
          });
          wx.setNavigationBarTitle({ title: name });
          this.loadMemoContent();
        } else if (firstImageShown) {
          // 后续图片增量追加
          this.setData({
            itemPaths: validPaths,
            totalImages: validPaths.length,
            pdfConvertProgress: `${i + 1}/${cloudImageIds.length}`,
          });
        }
      }

      // 过滤掉下载失败的占位
      const finalPaths = localPaths.filter((p: string) => p);

      // 更新 storage
      const imageList = wx.getStorageSync('imageList') || [];
      const fileList = wx.getStorageSync('fileList') || [];
      const updatedImageList = imageList.map((img: any) => {
        if (img.id === id) {
          return { ...img, paths: finalPaths, path: finalPaths[0], cloudImages: cloudImageIds };
        }
        return img;
      });
      const updatedFileList = fileList.map((file: any) => {
        if (file.id === id) {
          return { ...file, paths: finalPaths, path: finalPaths[0], cloudImages: cloudImageIds };
        }
        return file;
      });
      wx.setStorageSync('imageList', updatedImageList);
      wx.setStorageSync('fileList', updatedFileList);

      // 最终 UI 更新
      if (!this.data.isPageHidden) {
        // 如果从未显示过（所有图片都下载失败），提示并返回
        if (!firstImageShown) {
          wx.hideLoading();
          this.showToast('图片加载失败，请检查网络');
          setTimeout(() => wx.navigateBack(), 1500);
          this.setData({ isConverting: false, pdfConvertProgress: '' });
          return;
        }

        const preserveIndex = Math.min(this.data.currentImageIndex, finalPaths.length - 1);
        this.setData({
          itemPath: finalPaths[preserveIndex],
          itemPaths: finalPaths,
          currentImageIndex: preserveIndex,
          totalImages: finalPaths.length,
          isConverting: false,
          pdfConvertProgress: '',
        });

        if (failedCount > 0) {
          this.showToast(`已加载 ${finalPaths.length}/${cloudImageIds.length} 张，部分图片加载失败`);
        }
      } else {
        this.setData({ isConverting: false, pdfConvertProgress: '' });
      }

      // 标记文件已验证，后续 onShow 跳过磁盘检查
      this._verifiedFileItems[id] = finalPaths.join(',');

    } catch (err: any) {
      if (!this.data.isPageHidden) {
        wx.hideLoading();
        this.showToast(err?.message || '加载失败');
        setTimeout(() => wx.navigateBack(), 1500);
      }
      console.error('下载云端图片失败:', err);
      this.setData({ isConverting: false, pdfConvertProgress: '' });
    }
  },

  // ========== FAB 收起/展开 ==========

  /** fab 触摸开始 */
  onFabTouchStart(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];
    this._fabTouchStartX = touch.clientX;
    this._fabTouchStartY = touch.clientY;
    this._fabDragStarted = false;

    // 懒计算 FAB 宽度（用于收起阈值）
    if (!this._fabWidth) {
      wx.createSelectorQuery()
        .select('.detail-fab-group')
        .boundingClientRect((rect: any) => {
          if (rect) this._fabWidth = rect.width;
        })
        .exec();
    }
  },

  /** fab 跟手拖拽 */
  onFabTouchMove(e: WechatMiniprogram.TouchEvent) {
    if (this.data.isFabCollapsed) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._fabTouchStartX;
    const dy = touch.clientY - this._fabTouchStartY;

    // 水平位移超过阈值才开始拖拽
    if (!this._fabDragStarted) {
      if (dx > 8 && dx > Math.abs(dy)) {
        this._fabDragStarted = true;
      } else {
        return;
      }
    }

    // 只允许向右拖动，超过 120px 后加橡皮筋阻尼
    const rawOffset = Math.max(0, dx);
    const offset = rawOffset > 120 ? 120 + (rawOffset - 120) * 0.2 : rawOffset;
    const progress = Math.min(1, offset / 100);
    const opacity = 1 - progress * 0.4;

    this._fabCurrentOffset = offset;
    this.setData({
      isFabDragging: true,
      fabAnimStyle: `transform: translateY(-50%) translateX(${offset}px); opacity: ${opacity}; transition: none;`,
    });
  },

  /** fab 触摸结束：跟手拖拽后判断收起或弹回；快速滑动兜底 */
  onFabTouchEnd(e: WechatMiniprogram.TouchEvent) {
    // 跟手拖拽结束
    if (this.data.isFabDragging) {
      const threshold = this._fabWidth ? this._fabWidth / 2 : 50;
      const shouldCollapse = this._fabDragStarted && this._fabCurrentOffset > threshold;
      this.setData({
        isFabCollapsed: shouldCollapse,
        isFabDragging: false,
        fabAnimStyle: '',
      });
      this._fabCurrentOffset = 0;
      return;
    }

    // 兜底：快速右滑（未触发 drag move）
    if (!e.changedTouches.length) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._fabTouchStartX;
    const dy = touch.clientY - this._fabTouchStartY;
    if (dx > 40 && Math.abs(dy) < 60) {
      this.setData({ isFabCollapsed: true });
    }
  },

  /** 点击左侧装饰条收起 */
  onFabCollapse() {
    this.setData({
      isFabCollapsed: true,
      isFabDragging: false,
      fabAnimStyle: '',
    });
    this._fabCurrentOffset = 0;
  },

  /** 点击展开图标展开 */
  onFabExpand() {
    this.setData({ isFabCollapsed: false });
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