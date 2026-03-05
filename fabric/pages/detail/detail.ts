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
}

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
