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
  // 长按菜单
  showActionSheet: boolean;
  actionSheetActions: { text: string; value: string; type?: string }[];
  // 触摸相关（用于区分单指长按和多指缩放）
  touchStartTime: number;
  touchStartX: number;
  touchStartY: number;
  hasMultiTouch: boolean;    // 是否有多指触摸
  currentScale: number;      // 当前缩放值
  isSwiping: boolean;        // 是否正在执行swiper滑动
  // 备忘录
  memoContent: string;
}

// 最大图片数量
const MAX_IMAGES = 15;

// 通用的提示配置
const DETAIL_TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

Page<DetailPageData, WechatMiniprogram.IAnyObject>({
  /**
   * 页面的初始数据
   */
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
    // 长按菜单
    showActionSheet: false,
    actionSheetActions: [],
    // 触摸相关
    touchStartTime: 0,
    touchStartX: 0,
    touchStartY: 0,
    hasMultiTouch: false,
    currentScale: 1,
    isSwiping: false,
    // 备忘录
    memoContent: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options: Record<string, string>) {
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
   * @param id 图解ID
   * @param preserveIndex 是否保留当前图片索引（用于 onShow 时避免重置位置）
   */
  loadItemDetail(id: string, preserveIndex: boolean = false) {
    // 从本地存储中查找图解详情
    const imageList = wx.getStorageSync("imageList") || [];
    const fileList = wx.getStorageSync("fileList") || [];

    // 合并列表并查找指定ID的项目
    const allItems = [...imageList, ...fileList];
    const item = allItems.find((item) => item.id === id);

    if (item) {
      // 兼容处理：paths 存在则用 paths，否则用 [path]
      const itemPaths = item.paths || [item.path];
      const totalImages = itemPaths.length;

      // 确定图片索引
      let newIndex = 0;
      if (preserveIndex) {
        // 保留当前索引时，确保索引不超出范围
        newIndex = Math.min(this.data.currentImageIndex, totalImages - 1);
      } else if (item.type === 'image') {
        // 尝试恢复保存的图片索引
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
      });

      // 设置导航栏标题为图解名称
      wx.setNavigationBarTitle({
        title: item.name
      });

      // 加载备忘录内容
      this.loadMemoContent();
    } else {
      this.showToast("未找到图解");
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  },

  /**
   * 预览图片（支持查看大图和缩放）
   */
  previewImage() {
    // 实现双击图片才进入预览模式
    const now = Date.now();
    if (now - this.data.lastTapTime < 300) {
      // 双击时进入全屏预览
      if (this.data.itemType === "image") {
        wx.previewImage({
          current: this.data.itemPath,
          urls: this.data.itemPaths,
        });
      }
    }

    // 更新最后点击时间
    this.setData({
      lastTapTime: now
    });
  },

  /**
   * swiper滑动切换事件（通过编程方式切换时触发）
   */
  onSwiperChange(e: WechatMiniprogram.SwiperChange) {
    // 由于使用catchtouchmove，swiper不会自动响应触摸
    // 此方法保留用于其他编程式切换场景
    const current = e.detail.current;
    this.setData({
      currentImageIndex: current,
      itemPath: this.data.itemPaths[current],
      currentScale: 1,
    });
  },

  /**
   * movable-view缩放事件
   */
  onMovableScale(e: WechatMiniprogram.CustomEvent) {
    const scale = e.detail.scale;
    this.setData({ currentScale: scale });
  },

  /**
   * 处理图片长按事件 - 显示操作菜单（仅单指长按时触发）
   */
  onLongTap() {
    // 如果有多指触摸或当前处于缩放状态，不显示菜单
    if (this.data.hasMultiTouch || this.data.currentScale > 1) {
      return;
    }

    const { totalImages } = this.data;
    const actions: { text: string; value: string; type?: string }[] = [];

    // 当图片数量超过1时显示删除选项
    if (totalImages > 1) {
      actions.push({ text: "删除图片", value: "delete", type: "warn" });
    }

    // 当图片数量小于最大数量时显示添加选项
    if (totalImages < MAX_IMAGES) {
      actions.push({ text: "添加图片", value: "add" });
    }

    // 注意：weui action-sheet 自带取消按钮，不需要额外添加

    if (actions.length > 0) {
      this.setData({
        showActionSheet: true,
        actionSheetActions: actions,
      });
    }
  },

  /**
   * 触摸开始事件
   */
  onTouchStart(e: WechatMiniprogram.TouchEvent) {
    const touch = e.touches[0];
    this.setData({
      touchStartTime: Date.now(),
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
      hasMultiTouch: e.touches.length > 1,
      isSwiping: false,
    });
  },

  /**
   * 触摸移动事件
   */
  onTouchMove(e: WechatMiniprogram.TouchEvent) {
    if (e.touches.length > 1) {
      this.setData({ hasMultiTouch: true });
      return;
    }

    // 缩放状态下不处理swiper滑动
    if (this.data.currentScale > 1) {
      return;
    }

    // scale = 1 时，检测横向滑动意图
    const touch = e.touches[0];
    const deltaX = touch.clientX - this.data.touchStartX;
    const deltaY = touch.clientY - this.data.touchStartY;

    // 判断是否为横向滑动
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      this.setData({ isSwiping: true });
    }
  },

  /**
   * 触摸结束事件
   */
  onTouchEnd(e: WechatMiniprogram.TouchEvent) {
    // 缩放状态下不处理swiper切换
    if (this.data.currentScale > 1) {
      this.setData({ hasMultiTouch: false });
      return;
    }

    // scale = 1 时，根据滑动距离决定是否切换图片
    if (this.data.isSwiping) {
      const { touchStartX, currentImageIndex, totalImages } = this.data;
      const touch = e.changedTouches[0];
      const deltaX = touchStartX - touch.clientX;
      const SWIPE_THRESHOLD = 50;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
        let newIndex = currentImageIndex;
        if (deltaX > 0 && currentImageIndex < totalImages - 1) {
          newIndex = currentImageIndex + 1;
        } else if (deltaX < 0 && currentImageIndex > 0) {
          newIndex = currentImageIndex - 1;
        }

        if (newIndex !== currentImageIndex) {
          this.setData({
            currentImageIndex: newIndex,
            itemPath: this.data.itemPaths[newIndex],
            currentScale: 1,
          });
        }
      }
    }

    this.setData({ hasMultiTouch: false, isSwiping: false });
  },

  /**
   * 关闭操作菜单
   */
  closeActionSheet() {
    this.setData({
      showActionSheet: false,
    });
  },

  /**
   * 处理操作菜单点击
   */
  handleActionClick(e: WechatMiniprogram.CustomEvent) {
    const action = e.detail.value;

    this.setData({
      showActionSheet: false,
    });

    switch (action) {
      case "delete":
        this.deleteCurrentImage();
        break;
      case "add":
        this.addImages();
        break;
      case "cancel":
        // 关闭菜单，已处理
        break;
    }
  },

  /**
   * 删除当前图片
   */
  deleteCurrentImage() {
    const { itemPaths, currentImageIndex, itemId } = this.data;

    if (itemPaths.length <= 1) {
      this.showToast("至少保留一张图片");
      return;
    }

    // 删除当前图片
    const newPaths = [...itemPaths];
    newPaths.splice(currentImageIndex, 1);

    // 计算新的索引（如果删除的是最后一张，则显示前一张）
    const newIndex = Math.min(currentImageIndex, newPaths.length - 1);

    // 更新数据
    this.setData({
      itemPaths: newPaths,
      totalImages: newPaths.length,
      currentImageIndex: newIndex,
      itemPath: newPaths[newIndex],
    });

    // 更新本地存储
    this.updateImageListStorage(newPaths);

    this.showToast("已删除");
  },

  /**
   * 添加图片
   */
  addImages() {
    const { itemPaths, currentImageIndex } = this.data;
    const remainingCount = MAX_IMAGES - itemPaths.length;

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

        // 在当前图片位置后插入新图片
        const updatedPaths = [...itemPaths];
        updatedPaths.splice(currentImageIndex + 1, 0, ...newPaths);

        // 更新数据，定位到新插入的第一张图片
        const newIndex = currentImageIndex + 1;

        this.setData({
          itemPaths: updatedPaths,
          totalImages: updatedPaths.length,
          currentImageIndex: newIndex,
          itemPath: updatedPaths[newIndex],
        });

        // 更新本地存储
        this.updateImageListStorage(updatedPaths);

        this.showToast(`已添加 ${newPaths.length} 张图片`);
      },
    });
  },

  /**
   * 更新本地存储中的图片列表
   */
  updateImageListStorage(newPaths: string[]) {
    const { itemId } = this.data;
    const imageList = wx.getStorageSync("imageList") || [];

    const index = imageList.findIndex((item: any) => item.id === itemId);
    if (index !== -1) {
      imageList[index].paths = newPaths;
      imageList[index].path = newPaths[0]; // 兼容旧版本，第一张作为主路径
      wx.setStorageSync("imageList", imageList);
    }
  },

  /**
   * 显示提示信息
   */
  showToast(title: string) {
    wx.showToast({
      title,
      ...DETAIL_TOAST_CONFIG,
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时刷新数据，保留当前图片位置
    if (this.data.itemId) {
      this.loadItemDetail(this.data.itemId, true);
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    this.saveLastImageIndex();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.saveLastImageIndex();
  },

  /**
   * 保存当前图片索引到本地存储
   */
  saveLastImageIndex() {
    const { itemId, currentImageIndex, itemType } = this.data;
    if (!itemId || itemType !== 'image') return;

    const storage = wx.getStorageSync(LAST_IMAGE_INDEX_KEY) || {};
    storage[itemId] = currentImageIndex;
    wx.setStorageSync(LAST_IMAGE_INDEX_KEY, storage);
  },

  /**
   * 点击备忘录按钮
   */
  onMemoTap() {
    const { itemId, memoContent } = this.data;

    wx.navigateTo({
      url: `/pages/memo/memo?key=${itemId}&content=${encodeURIComponent(memoContent)}`,
      events: {
        // 接收 memo 页面回传的数据
        onMemoContentChange: (data: { key: string; content: string }) => {
          if (data.key === itemId) {
            this.setData({ memoContent: data.content });
            this.saveMemoContent(data.content);
          }
        },
      },
    });
  },

  /**
   * 加载备忘录内容
   */
  loadMemoContent() {
    const itemId = this.data.itemId;
    if (!itemId) return;

    const memosStorage = wx.getStorageSync(MEMO_STORAGE_KEY) || {};
    const memoContent = memosStorage[itemId] || "";

    this.setData({ memoContent });
  },

  /**
   * 保存备忘录内容
   */
  saveMemoContent(content: string) {
    const itemId = this.data.itemId;
    if (!itemId) return;

    const memosStorage = wx.getStorageSync(MEMO_STORAGE_KEY) || {};
    memosStorage[itemId] = content;
    wx.setStorageSync(MEMO_STORAGE_KEY, memosStorage);
  },
});
