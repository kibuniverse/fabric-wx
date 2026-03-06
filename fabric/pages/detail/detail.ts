// pages/detail/detail.ts

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
}

// 最大图片数量
const MAX_IMAGES = 9;

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
   */
  loadItemDetail(id: string) {
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

      this.setData({
        itemType: item.type,
        itemName: item.name,
        itemPath: itemPaths[0], // 当前显示的图片路径
        itemPaths,
        currentImageIndex: 0,
        totalImages,
      });

      // 设置导航栏标题为图解名称
      wx.setNavigationBarTitle({
        title: item.name
      });

      // 加载该项目对应的计数器值
      this.loadCounterValue();
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
   * 切换到上一张图片
   */
  prevImage() {
    const { currentImageIndex, itemPaths, totalImages } = this.data;
    if (totalImages <= 1) return;

    const newIndex = currentImageIndex > 0 ? currentImageIndex - 1 : totalImages - 1;
    this.setData({
      currentImageIndex: newIndex,
      itemPath: itemPaths[newIndex]
    });
  },

  /**
   * 切换到下一张图片
   */
  nextImage() {
    const { currentImageIndex, itemPaths, totalImages } = this.data;
    if (totalImages <= 1) return;

    const newIndex = currentImageIndex < totalImages - 1 ? currentImageIndex + 1 : 0;
    this.setData({
      currentImageIndex: newIndex,
      itemPath: itemPaths[newIndex]
    });
  },

  /**
   * swiper滑动切换事件
   */
  onSwiperChange(e: WechatMiniprogram.SwiperChange) {
    const current = e.detail.current;
    this.setData({
      currentImageIndex: current,
      itemPath: this.data.itemPaths[current],
    });
  },

  /**
   * 处理图片长按事件 - 显示操作菜单（仅单指长按时触发）
   */
  onLongTap() {
    // 如果有多指触摸，不显示菜单
    if (this.data.hasMultiTouch) {
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
    });
  },

  /**
   * 触摸移动事件
   */
  onTouchMove(e: WechatMiniprogram.TouchEvent) {
    // 检测是否变成多指触摸
    if (e.touches.length > 1) {
      this.setData({ hasMultiTouch: true });
    }
  },

  /**
   * 触摸结束事件
   */
  onTouchEnd() {
    // 延迟重置，避免长按事件触发后立即重置
    setTimeout(() => {
      this.setData({ hasMultiTouch: false });
    }, 100);
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
    // 每次显示页面时刷新数据
    if (this.data.itemId) {
      this.loadItemDetail(this.data.itemId);
    }
  },

  /**
   * 加载计数器值
   */
  loadCounterValue() {
    const itemId = this.data.itemId;
    if (!itemId) return;

    // 从本地存储中获取计数器值
    const countersStorage = wx.getStorageSync("itemCounters") || {};
    const counterValue = countersStorage[itemId] || 0;

    this.setData({
      count: counterValue,
    });
  },

  /**
   * 保存计数器值
   */
  saveCounterValue() {
    const itemId = this.data.itemId;
    if (!itemId) return;

    // 保存到本地存储
    const countersStorage = wx.getStorageSync("itemCounters") || {};
    countersStorage[itemId] = this.data.count;
    wx.setStorageSync("itemCounters", countersStorage);
  },

  /**
   * 增加计数器值
   */
  increaseCount() {
    const newCount = this.data.count + 1;
    this.setData({
      count: newCount,
    });
    this.saveCounterValue();
  },

  /**
   * 减少计数器值
   */
  decreaseCount() {
    if (this.data.count <= 0) return;

    const newCount = this.data.count - 1;
    this.setData({
      count: newCount,
    });
    this.saveCounterValue();
  },

  /**
   * 重置计数器值
   */
  resetCount() {
    this.setData({
      count: 0,
    });
    this.saveCounterValue();
  },
});
