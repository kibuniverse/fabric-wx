// pages/detail/detail.ts

// 定义详情页面需要的接口
interface DetailPageData {
  itemId: string;
  itemType: "image" | "pdf" | "";
  itemName: string;
  itemPath: string;
  count: number;
  currentPage: number;
  totalPages: number;
  imageScale: number; // 图片缩放比例
  lastTapTime: number; // 上次点击时间，用于双击检测
  lastX: number; // 上次移动的X坐标
  lastY: number; // 上次移动的Y坐标
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
    count: 0,
    currentPage: 1,
    totalPages: 1,
    imageScale: 1, // 默认缩放比例为1
    lastTapTime: 0, // 上次点击时间
    lastX: 0, // 上次X坐标
    lastY: 0, // 上次Y坐标
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
      this.setData({
        itemType: item.type,
        itemName: item.name,
        itemPath: item.path,
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
          urls: [this.data.itemPath],
        });
      }
    }
    
    // 更新最后点击时间
    this.setData({
      lastTapTime: now
    });
  },
  
  /**
   * 处理可移动视图变化事件
   */
  onMovableViewChange(e: any) {
    // 记录上次移动的坐标，使用于平滑过渡
    const { x, y } = e.detail;
    
    if (Math.abs(x - this.data.lastX) > 50 || Math.abs(y - this.data.lastY) > 50) {
      this.setData({
        lastX: x,
        lastY: y
      });
    }
  },
  
  /**
   * 处理图片缩放事件
   */
  onImageScale(e: any) {
    // 获取当前缩放比例
    const scale = e.detail.scale;
    
    // 添加判断避免频繁更新
    if (Math.abs(scale - this.data.imageScale) > 0.01) {
      this.setData({
        imageScale: scale
      });
    }
  },
  
  /**
   * 处理图片长按事件
   */
  onLongTap() {
    // 长按事件处理，仅阻止微信默认菜单弹出
    // 如果需要自定义长按行为，可以在这里添加
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
