// pages/home/home.ts
export {}

interface FileItem {
  id: string;
  name: string;
  originalName: string;
  path: string;          // 保留兼容旧数据，取 paths[0]
  paths: string[];       // 多图片路径数组（本地路径）
  type: 'image' | 'pdf';
  createTime: number;
  lastAccessTime?: number; // 最后操作时间（重命名、修改封面、打开）
  cover?: string;        // 自定义封面图片路径
  pdfSourcePath?: string; // PDF源文件路径（如果是从PDF转换来的）
  pdfPageCount?: number; // PDF总页数
  size?: number;         // 文件大小（字节），用于去重
  cloudFileId?: string;  // 云端PDF文件ID（用于删除时清理云端数据）

  // 云同步相关字段
  syncStatus?: 'local' | 'synced';  // 同步状态：local=本地未同步，synced=已同步云端
  cloudId?: string;  // 云端记录ID（synced 时有值）
  cloudImages?: string[];  // 云端图片文件ID数组（synced 时有值，用于详情页下载）
  cloudCover?: string;     // 云端封面文件ID（用于详情页下载）
  needsCoverDownload?: boolean;  // 是否需要下载封面（优化封面闪动）
  isBuiltin?: boolean;     // 是否为内置图解
}

const PULL_REFRESH_DEMO_SHOWN_KEY = 'pull_refresh_demo_shown';
const HOME_TAB_VISIT_COUNT_KEY = 'home_tab_visit_count';

const WELCOME_DIAGRAM_NAME = '知织小信';
const WELCOME_DIAGRAM_ASSET_PATH = '/assets/zhizhi_letter.png';
const WELCOME_DIAGRAM_ID = 'builtin_welcome_diagram';
const WELCOME_IMAGE_CACHE_KEY = 'welcome_diagram_cached_path';
const WELCOME_INITIALIZED_KEY = 'welcome_diagram_initialized';

/**
 * 判断是否是本地封面路径
 * 本地路径包括：wxfile://、/tmp/、非云端路径
 */
function isLocalCoverPath(coverPath: string | undefined): boolean {
  if (!coverPath) return false;
  // wxfile:// 是小程序本地保存文件路径
  // /tmp/ 是临时文件路径
  // http://tmp/ 是微信临时文件路径
  // 非 cloud:// 且非 http/https 开头（可能是相对路径或本地路径）
  return coverPath.startsWith('wxfile://') ||
         coverPath.startsWith('/tmp/') ||
         coverPath.startsWith('http://tmp/') ||
         (!coverPath.startsWith('cloud://') && !coverPath.startsWith('http'));
}

// 通用的提示配置
const TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

// 存储键常量
const STORAGE_KEYS = {
  LAST_SYNC_TIME: "lastDiagramSyncTime",  // 最后同步时间戳
  SYNCED_DIAGRAM_COUNT: "syncedDiagramCount",  // 上次同步时云端图解数量
  LAST_CHECK_UPDATE_TIME: "lastCheckUpdateTime",  // 上次 checkUpdate 调用时间
};

// checkUpdate 最小间隔（毫秒），5 分钟内不重复调用
const CHECK_UPDATE_INTERVAL = 5 * 60 * 1000;

// 排序函数：优先 lastAccessTime，其次 createTime
const sortItems = (items: FileItem[]) => items.sort((a, b) => {
  const aTime = a.lastAccessTime || 0;
  const bTime = b.lastAccessTime || 0;
  if (aTime !== bTime) return bTime - aTime;  // 最近操作的在前
  return b.createTime - a.createTime;  // 其次按创建时间
});

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isLoggedIn: false, // 登录状态
    showImportOptions: false, // 是否显示导入选项弹出层
    imageList: [] as FileItem[], // 图片列表
    fileList: [] as FileItem[], // 文件列表
    allItems: [] as FileItem[], // 合并后的所有项目
    
    // ActionSheet相关
    showActionSheet: false, // 是否显示操作菜单
    actions: [] as { text: string; value: string; type?: string }[], // 动态生成
    
    // 当前操作项
    currentItemId: '', // 当前操作的项目ID
    currentItemType: '', // 当前操作的项目类型 'image' 或 'file'
    currentItemName: '', // 当前项目的名称（用于重命名）
    
    // 弹窗状态
    showRenameModal: false, // 是否显示重命名弹窗
    renameInputFocus: false, // 重命名输入框是否聚焦
    showDeleteModal: false, // 是否显示删除确认弹窗
    newItemName: '', // 重命名输入框中的新名称
    
    // dialog按钮配置
    renameButtons: [
      {text: '取消', value: 0},
      {text: '确认', value: 1, type: 'primary'}
    ],
    deleteButtons: [
      {text: '取消', value: 0},
      {text: '删除', value: 1, type: 'warn'}
    ],

    // 命名对话框（导入多图时使用）
    showNameModal: false,
    nameInputFocus: false, // 命名输入框是否聚焦
    pendingImages: [] as string[], // 待命名的图片路径
    diagramName: '', // 输入的名称
    nameButtons: [
      {text: '取消', value: 0},
      {text: '确认', value: 1, type: 'primary'}
    ],

    // 高亮显示
    highlightItemId: '', // 需要高亮显示的项目ID（用于重复文件提示）

    // 登录引导弹窗
    showLoginPrompt: false,
    loginButtons: [
      {text: '取消', value: 0},
      {text: '去登录', value: 1, type: 'primary'}
    ],

    // 同步 Tips 提示
    showSyncTips: false,
    firstLocalItemId: '',

    // 正在同步的图解（用于显示旋转动画）{ [id]: true }
    syncingStatus: {} as Record<string, boolean>,

    // 下拉刷新演示动画
    showRefreshDemo: false,
    isRefreshDemoPlaying: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 加载本地存储的图片和文件列表
    this.loadLocalData();
  },

  /**
   * 从本地存储加载数据
   * 为旧数据添加默认的 syncStatus
   */
  loadLocalData() {
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = userInfo && userInfo.isLoggedIn;

    let imageList = wx.getStorageSync('imageList') || [];
    let fileList = wx.getStorageSync('fileList') || [];

    // 为旧数据添加默认 syncStatus（兼容迁移）
    imageList = imageList.map((item: FileItem) => ({
      ...item,
      syncStatus: item.syncStatus || 'local' as const  // 旧数据默认为 local
    }));
    fileList = fileList.map((item: FileItem) => ({
      ...item,
      syncStatus: item.syncStatus || 'local' as const  // 旧数据默认为 local
    }));

    const ensured = this.ensureWelcomeDiagram(imageList, fileList);
    imageList = ensured.imageList;
    fileList = ensured.fileList;

    // 合并并排序
    const allItems = sortItems([...imageList, ...fileList]);
    console.log('All Items:', allItems, imageList, fileList);

    // 检查是否需要显示同步 Tips
    const hasShownSyncTips = wx.getStorageSync('has_shown_sync_tips');
    const firstLocalItem = allItems.find(item => item.syncStatus === 'local' && !item.isBuiltin);
    const showSyncTips = isLoggedIn && firstLocalItem && !hasShownSyncTips;

    this.setData({
      isLoggedIn,
      imageList,
      fileList,
      allItems,
      showSyncTips,
      firstLocalItemId: firstLocalItem?.id || ''
    });
  },

  /**
   * 隐藏同步 Tips，记录用户已看过
   */
  hideSyncTips() {
    wx.setStorageSync('has_shown_sync_tips', true);
    this.setData({ showSyncTips: false });
  },

  /**
   * 检查是否需要展示下拉刷新演示动画（设备级别一次性，第2次进入时触发）
   */
  _refreshDemoTriggered: false,
  checkRefreshDemo() {
    if (this._refreshDemoTriggered) return;
    const shown = wx.getStorageSync(PULL_REFRESH_DEMO_SHOWN_KEY);
    if (shown) { this._refreshDemoTriggered = true; return; }

    // 累加访问次数
    const visitCount = (wx.getStorageSync(HOME_TAB_VISIT_COUNT_KEY) || 0) + 1;
    wx.setStorageSync(HOME_TAB_VISIT_COUNT_KEY, visitCount);

    // 第 2 次及以上访问且已登录且有图解时触发
    if (visitCount < 2) return;
    if (!this.data.isLoggedIn) return;
    if (this.data.allItems.length === 0) return;

    this._refreshDemoTriggered = true;

    setTimeout(() => {
      this.setData({ showRefreshDemo: true, isRefreshDemoPlaying: true });

      setTimeout(() => {
        this.setData({ showRefreshDemo: false, isRefreshDemoPlaying: false });
        wx.setStorageSync(PULL_REFRESH_DEMO_SHOWN_KEY, true);
      }, 3200);
    }, 600);
  },

  /**
   * 切换导入选项显示状态
   * 如果用户未登录且已有1个图解，显示登录引导弹窗
   * 如果用户已登录且本地已有10个图解，提示限制
   */
  toggleImportOptions() {
    const isLoggedIn = this.data.isLoggedIn;
    const localCount = this.data.allItems.filter(item => !item.isBuiltin).length;

    if (!isLoggedIn) {
      // 未登录：检查本地图解数量，超过1个则引导登录
      if (localCount >= 1) {
        this.setData({ showLoginPrompt: true });
        return;
      }
    } else {
      // 已登录：只检查本地图解数量
      if (localCount >= 10) {
        wx.showToast({ title: '暂时最多只能创建10个图解', icon: 'none' });
        return;
      }
    }

    this.setData({
      showImportOptions: !this.data.showImportOptions
    });
  },

  /**
   * 获取云端图解数量
   */
  async getCloudDiagramCount(): Promise<number> {
    try {
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'count' }
      }) as any;

      if (res.result && res.result.success) {
        return res.result.data.count;
      }
      return 0;
    } catch (error) {
      console.error('获取云端图解数量失败:', error);
      return 0;
    }
  },

  /**
   * 关闭导入选项弹出层（点击遮罩层时使用）
   */
  closeImportOptions() {
    this.setData({ showImportOptions: false });
  },

  /**
   * 持久化保存临时文件
   * @param tempFilePath 临时文件路径
   * @returns 持久化文件路径
   */
  saveFilePermanently(tempFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.saveFile({
        tempFilePath,
        success: (res) => {
          resolve(res.savedFilePath);
        },
        fail: (err) => {
          console.error('保存文件失败:', err);
          reject(err);
        }
      });
    });
  },

  /**
   * 选择并导入图片
   */
  async chooseImage() {
    // 关闭导入选项弹出层
    this.setData({
      showImportOptions: false
    });

    // 调用系统相册选择图片
    wx.chooseMedia({
      count: 9, // 最多可以选择的文件个数
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success: async (res) => {
        // 获取临时文件路径
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);

        // 持久化保存所有图片
        wx.showLoading({ title: '保存中...', mask: true });
        const savedPaths: string[] = [];

        for (const tempPath of tempFiles) {
          try {
            const savedPath = await this.saveFilePermanently(tempPath);
            savedPaths.push(savedPath);
          } catch (err) {
            console.error('保存图片失败:', tempPath, err);
          }
        }
        wx.hideLoading();

        if (savedPaths.length === 0) {
          this.showToast('保存图片失败');
          return;
        }

        // 生成默认名称（取第一张图片的文件名）
        const firstFileName = savedPaths[0].split('/').pop() || '未命名图解';
        const defaultName = firstFileName.length > 10 ? firstFileName.substring(0, 7) + '...' : firstFileName;

        this.setData({
          pendingImages: savedPaths,
          diagramName: defaultName,
          showNameModal: true,
          nameInputFocus: true  // 自动聚焦
        });
      }
    })
  },

  /**
   * 处理命名对话框输入
   */
  onNameInput(e: any) {
    this.setData({
      diagramName: e.detail.value
    });
  },

  /**
   * 处理命名对话框按钮点击
   */
  handleNameDialogButtonClick(e: any) {
    const index = e.detail.index;

    if (index === 0) {
      // 点击取消按钮
      this.setData({
        showNameModal: false,
        nameInputFocus: false,
        pendingImages: [],
        diagramName: ''
      });
    } else if (index === 1) {
      // 点击确认按钮
      this.confirmCreateDiagram();
    }
  },

  /**
   * 确认创建图解项目
   */
  async confirmCreateDiagram() {
    const { pendingImages, diagramName, isLoggedIn } = this.data;

    if (!diagramName.trim()) {
      this.showToast('名称不能为空');
      return;
    }

    if (pendingImages.length === 0) {
      this.showToast('未选择图片');
      return;
    }

    wx.showLoading({ title: '创建中...', mask: true });

    // 创建单个图解项目，包含多张图片
    const now = Date.now();
    const newItem: FileItem = {
      id: this.generateUniqueId(),
      name: diagramName,
      originalName: diagramName,
      path: pendingImages[0], // 兼容旧数据
      paths: pendingImages,
      type: 'image',
      createTime: now,
      lastAccessTime: now, // 新导入的图解排在第一个
      cover: pendingImages[0], // 第一张图片作为默认封面
      syncStatus: isLoggedIn ? 'synced' : 'local'  // 根据登录状态设置
    };

    // 已登录时，上传到云端
    if (isLoggedIn) {
      try {
        const uploadResult: any = await this.uploadDiagramToCloud(newItem);
        if (uploadResult) {
          newItem.cloudId = uploadResult.cloudId;
          newItem.cloudImages = uploadResult.cloudImages;  // 关键：保存云端图片 ID
        }
      } catch (error) {
        console.error('上传图解到云端失败:', error);
        // 上传失败时，改为本地存储
        newItem.syncStatus = 'local';
        wx.showToast({ title: '云同步失败，已保存本地', icon: 'none' });
      }
    }

    // 更新图片列表
    const updatedImageList = [...this.data.imageList, newItem];
    const allItems = sortItems([...updatedImageList, ...this.data.fileList]);

    this.setData({
      imageList: updatedImageList,
      allItems,
      showNameModal: false,
      nameInputFocus: false,
      pendingImages: [],
      diagramName: ''
    });

    // 保存到本地存储
    wx.setStorageSync('imageList', updatedImageList);

    // 如果已同步到云端，更新同步时间戳和数量
    if (isLoggedIn && newItem.syncStatus === 'synced') {
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      const prevCount = wx.getStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT);
      wx.setStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT, (prevCount || 0) + 1);
    }

    wx.hideLoading();
    this.showToast(`已创建图解，包含${pendingImages.length}张图片`);
  },

  /**
   * 上传图解到云端
   * @param item 图解项目
   */
  async uploadDiagramToCloud(item: FileItem): Promise<{ cloudId: string; cloudImages: string[] } | null> {
    try {
      // 1. 上传图片到云存储
      const cloudImages: string[] = [];
      for (const localPath of item.paths) {
        const cloudPath = `diagrams/${item.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath: localPath
        });
        if (uploadResult.fileID) {
          cloudImages.push(uploadResult.fileID);
        }
      }

      // 2. 获取计数器和备忘录数据
      const countersStorage = wx.getStorageSync('simpleCounters') || {};
      const memosStorage = wx.getStorageSync('itemMemos') || {};
      const counterCount = countersStorage[item.id] || 0;
      const memoContent = memosStorage[item.id] || '';

      // 3. 调用云函数保存记录（包含计数器和备忘录）
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: {
          action: 'upload',
          diagram: {
            id: item.id,
            name: item.name,
            originalName: item.originalName,
            type: item.type,
            createTime: item.createTime,
            cover: cloudImages[0] || '',
            images: cloudImages,
            size: item.size,
            // 新增：计数器和备忘录数据
            counterData: {
              count: counterCount,
              updatedAt: new Date()
            },
            memoContent: memoContent,
            lastAccessTime: item.lastAccessTime || item.createTime
          }
        }
      }) as any;

      if (res.result && res.result.success) {
        return { cloudId: res.result.data.cloudId, cloudImages };
      }
      return null;
    } catch (error) {
      console.error('上传图解到云端失败:', error);
      throw error;
    }
  },

  /**
   * 选择并导入PDF
   */
  choosePDF() {
    // 关闭导入选项弹出层
    this.setData({
      showImportOptions: false
    });

    // 调用系统文件选择器选择PDF
    wx.chooseMessageFile({
      count: 1, // 每次只选择一个PDF
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const file = res.tempFiles[0];

        // 检查文件大小（限制10MB）
        if (file.size > 10 * 1024 * 1024) {
          this.showToast('PDF文件不能超过10MB');
          return;
        }

        // 检查是否已存在相同文件（文件名 + 文件大小去重）
        const duplicate = this.checkPdfDuplicate(file.name, file.size);
        if (duplicate) {
          // 先显示 Toast 提示
          this.showToast('该PDF已存在，请勿重复上传');

          // Toast 消失后（1500ms）再开始高亮动画
          setTimeout(() => {
            this.setData({
              highlightItemId: duplicate.id
            });

            // 动画持续 2s，结束后取消高亮
            setTimeout(() => {
              this.setData({ highlightItemId: '' });
            }, 2000);
          }, 1500);

          return;
        }

        const fileName = file.name.length > 10 ? file.name.substring(0, 7) + '...' : file.name;
        const now = Date.now();

        // 创建PDF项目，保存到fileList，转换将在detail页面首次打开时进行
        // PDF 导入时暂时保存为 local，转换完成后再同步到云端
        const newItem: FileItem = {
          id: this.generateUniqueId(),
          name: fileName,
          originalName: file.name,
          path: file.path,
          paths: [], // 初始为空，转换后填充
          type: 'pdf',
          size: file.size, // 保存文件大小用于去重
          createTime: now,
          lastAccessTime: now, // 新导入的图解排在第一个
          syncStatus: 'local'  // PDF 转换后再同步
        };

        // 更新文件列表
        const updatedFileList = [...this.data.fileList, newItem];
        const allItems = sortItems([...this.data.imageList, ...updatedFileList]);

        // 检查是否需要显示同步 Tips（已登录、未显示过、且有 local 项目）
        const hasShownSyncTips = wx.getStorageSync('has_shown_sync_tips');
        const firstLocalItem = allItems.find(item => item.syncStatus === 'local' && !item.isBuiltin);
        const showSyncTips = this.data.isLoggedIn && firstLocalItem && !hasShownSyncTips;

        this.setData({
          fileList: updatedFileList,
          allItems,
          showSyncTips,
          firstLocalItemId: firstLocalItem?.id || ''
        });

        // 保存到本地存储
        wx.setStorageSync('fileList', updatedFileList);
        this.showToast('导入成功');
      }
    });
  },

  /**
   * 生成唯一ID
   */
  generateUniqueId(): string {
    return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  },

  /**
   * 检查PDF是否已存在（根据文件名和文件大小去重）
   * @param name 文件名
   * @param size 文件大小（字节）
   * @returns 已存在则返回该文件项，否则返回 null
   */
  checkPdfDuplicate(name: string, size: number): FileItem | null {
    const fileList = this.data.fileList;
    return fileList.find(item =>
      item.type === 'pdf' &&
      item.originalName === name &&
      item.size === size
    ) || null;
  },
  
  /**
   * 显示操作菜单
   */
  showActionSheet(e: any) {
    // 阻止触发事件冒泡
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type; // 'image' 或 'file'

    // 根据类型获取当前项
    const currentItem = this.data.allItems.find(item => item.id === id);
    console.log('Current Item:', currentItem);
    if (currentItem) {
      // 根据类型动态生成菜单选项
      const actions: { text: string; value: string; type?: string }[] = [
        { text: '重命名', value: 'rename' },
        { text: '修改封面', value: 'changeCover' },
      ];

      // 仅当类型为图片时显示"修改图解"选项
      if (type === 'image') {
        actions.push({ text: '修改图解', value: 'edit' });
      }

      actions.push({ text: '删除', value: 'delete', type: 'warn' });

      this.setData({
        showActionSheet: true,
        actions,
        currentItemId: id,
        currentItemType: type,
        currentItemName: currentItem.name || currentItem.originalName
      });
    }
  },
  
  /**
   * 关闭操作菜单
   */
  closeActionSheet() {
    this.setData({
      showActionSheet: false
    });
  },
  
  /**
   * 处理操作菜单点击事件
   */
  handleActionClick(e: any) {
    const action = e.detail.value;

    this.setData({
      showActionSheet: false
    });

    // 根据选项执行不同操作
    switch (action) {
      case 'rename':
        this.showRenameModal();
        break;
      case 'changeCover':
        this.chooseCoverImage();
        break;
      case 'edit':
        this.navigateToEdit();
        break;
      case 'delete':
        this.showDeleteModal();
        break;
    }
  },
  
  /**
   * 显示重命名弹窗
   */
  showRenameModal() {
    this.setData({
      showRenameModal: true,
      newItemName: this.data.currentItemName,
      renameInputFocus: true  // 自动聚焦
    });
  },

  /**
   * 选择并修改封面图片
   */
  chooseCoverImage() {
    const { currentItemId, currentItemType } = this.data;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: async (compressRes) => {
            // 持久化保存压缩后的图片
            try {
              const savedPath = await this.saveFilePermanently(compressRes.tempFilePath);
              this.updateCover(currentItemId, currentItemType, savedPath);
            } catch (err) {
              console.error('保存封面失败:', err);
              // 保存失败时尝试使用原图路径
              this.updateCover(currentItemId, currentItemType, compressRes.tempFilePath);
            }
          },
          fail: async () => {
            // 压缩失败时直接保存原图
            try {
              const savedPath = await this.saveFilePermanently(tempFilePath);
              this.updateCover(currentItemId, currentItemType, savedPath);
            } catch (err) {
              console.error('保存封面失败:', err);
              this.updateCover(currentItemId, currentItemType, tempFilePath);
            }
          }
        });
      }
    });
  },

  /**
   * 更新封面图片
   */
  async updateCover(itemId: string, itemType: string, coverPath: string) {
    const now = Date.now();
    // 获取当前项（用于检查同步状态）
    const currentItem = this.data.allItems.find(item => item.id === itemId);

    if (itemType === 'image') {
      const updatedList = this.data.imageList.map(item => {
        if (item.id === itemId) {
          return { ...item, cover: coverPath, lastAccessTime: now };
        }
        return item;
      });

      const allItems = sortItems([...updatedList, ...this.data.fileList]);

      this.setData({
        imageList: updatedList,
        allItems
      });

      wx.setStorageSync('imageList', updatedList);
    } else {
      const updatedList = this.data.fileList.map(item => {
        if (item.id === itemId) {
          return { ...item, cover: coverPath, lastAccessTime: now };
        }
        return item;
      });

      const allItems = sortItems([...this.data.imageList, ...updatedList]);

      this.setData({
        fileList: updatedList,
        allItems
      });

      wx.setStorageSync('fileList', updatedList);
    }

    // 如果已同步到云端，上传新封面并更新云端记录
    if (currentItem && currentItem.syncStatus === 'synced') {
      try {
        // 上传封面到云存储
        const cloudPath = `diagrams/${itemId}/cover_${Date.now()}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: coverPath
        });

        if (uploadRes.fileID) {
          // 更新云端记录
          await wx.cloud.callFunction({
            name: 'syncDiagramData',
            data: { action: 'updateInfo', diagramId: itemId, cover: uploadRes.fileID, lastAccessTime: now }
          });
          console.log('[Home] 更新云端封面成功:', itemId);
          // 更新本地 cloudCover（避免下次同步时误判为云端封面变化导致重新下载）
          const coverListKey = itemType === 'image' ? 'imageList' : 'fileList';
          const coverList = wx.getStorageSync(coverListKey) || [];
          const updatedCoverList = coverList.map((item: any) => {
            if (item.id === itemId) {
              return { ...item, cloudCover: uploadRes.fileID };
            }
            return item;
          });
          wx.setStorageSync(coverListKey, updatedCoverList);
          // 更新本地同步时间戳（跨设备同步）
          wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
        }
      } catch (err) {
        console.error('[Home] 更新云端封面失败:', err);
      }
    }

    this.showToast('封面已更新');
  },
  
  /**
   * 处理重命名输入框输入事件
   */
  onRenameInput(e: any) {
    this.setData({
      newItemName: e.detail.value
    });
  },
  
  /**
   * 处理重命名对话框按钮点击
   */
  handleRenameDialogButtonClick(e: any) {
    const index = e.detail.index;
    
    if (index === 0) {
      // 点击取消按钮
      this.setData({
        showRenameModal: false,
        renameInputFocus: false
      });
    } else if (index === 1) {
      // 点击确认按钮
      this.confirmRename();
    }
  },
  
  /**
   * 确认重命名
   */
  confirmRename() {
    const { currentItemId, currentItemType, newItemName } = this.data;

    if (!newItemName.trim()) {
      this.showToast('名称不能为空');
      return;
    }

    const now = Date.now();
    // 获取当前项（用于检查同步状态）
    const currentItem = this.data.allItems.find(item => item.id === currentItemId);

    // 更新对应列表中的项目名称
    if (currentItemType === 'image') {
      const updatedList = this.data.imageList.map(item => {
        if (item.id === currentItemId) {
          return { ...item, name: newItemName, lastAccessTime: now };
        }
        return item;
      });

      // 重新计算合并列表
      const allItems = sortItems([...updatedList, ...this.data.fileList]);

      this.setData({
        imageList: updatedList,
        allItems,
        showRenameModal: false,
        renameInputFocus: false
      });

      // 更新本地存储
      wx.setStorageSync('imageList', updatedList);
    } else {
      const updatedList = this.data.fileList.map(item => {
        if (item.id === currentItemId) {
          return { ...item, name: newItemName, lastAccessTime: now };
        }
        return item;
      });

      // 重新计算合并列表
      const allItems = sortItems([...this.data.imageList, ...updatedList]);

      this.setData({
        fileList: updatedList,
        allItems,
        showRenameModal: false,
        renameInputFocus: false
      });

      // 更新本地存储
      wx.setStorageSync('fileList', updatedList);
    }

    // 如果已同步到云端，更新云端名称
    if (currentItem && currentItem.syncStatus === 'synced') {
      wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'updateInfo', diagramId: currentItemId, name: newItemName, lastAccessTime: now }
      }).then(() => {
        console.log('[Home] 更新云端名称成功:', currentItemId, newItemName);
        // 更新本地同步时间戳（跨设备同步）
        wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      }).catch(err => {
        console.error('[Home] 更新云端名称失败:', err);
      });
    }

    this.showToast('重命名成功');
  },
  
  /**
   * 显示删除确认弹窗
   */
  showDeleteModal() {
    this.setData({
      showDeleteModal: true
    });
  },
  
  /**
   * 处理删除对话框按钮点击
   */
  handleDeleteDialogButtonClick(e: any) {
    const index = e.detail.index;
    
    if (index === 0) {
      // 点击取消按钮
      this.setData({
        showDeleteModal: false
      });
    } else if (index === 1) {
      // 点击删除按钮
      this.confirmDelete();
    }
  },
  
  /**
   * 确认删除
   */
  confirmDelete() {
    const { currentItemId } = this.data;

    if (!currentItemId) {
      this.showToast('删除失败：未找到项目');
      this.setData({ showDeleteModal: false });
      return;
    }

    // 获取要删除的项目信息（用于清理关联数据）
    const currentItem = this.data.allItems.find(item => item.id === currentItemId);

    // 清理该项目关联的所有数据
    this.cleanupItemData(currentItemId, currentItem);

    // 从两个列表中都尝试删除，确保数据一致
    const finalImageList = this.data.imageList.filter(item => item.id !== currentItemId);
    const finalFileList = this.data.fileList.filter(item => item.id !== currentItemId);

    // 重新计算合并列表
    const allItems = sortItems([...finalImageList, ...finalFileList]);

    this.setData({
      imageList: finalImageList,
      fileList: finalFileList,
      allItems,
      showDeleteModal: false
    });

    // 更新本地存储
    wx.setStorageSync('imageList', finalImageList);
    wx.setStorageSync('fileList', finalFileList);

    // 如果删除的是已同步图解，更新同步时间戳和数量
    if (currentItem && currentItem.syncStatus === 'synced') {
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      const prevCount = wx.getStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT);
      if (prevCount !== '' && prevCount > 0) {
        wx.setStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT, prevCount - 1);
      }
    }

    this.showToast('删除成功');
  },

  /**
   * 清理项目关联的所有数据（计数器、备忘录、页码、本地图片、云端文件）
   * @param itemId 项目ID
   * @param item 项目信息（可选，用于清理图片和云端文件）
   */
  cleanupItemData(itemId: string, item?: FileItem) {
    // 1. 清理计数器数据
    const countersStorage = wx.getStorageSync('simpleCounters') || {};
    if (countersStorage[itemId] !== undefined) {
      delete countersStorage[itemId];
      wx.setStorageSync('simpleCounters', countersStorage);
    }

    // 2. 清理备忘录数据
    const memosStorage = wx.getStorageSync('itemMemos') || {};
    if (memosStorage[itemId] !== undefined) {
      delete memosStorage[itemId];
      wx.setStorageSync('itemMemos', memosStorage);
    }

    // 3. 清理备忘录修改时间
    const lastModifiedKey = `memo_${itemId}_lastModified`;
    wx.removeStorageSync(lastModifiedKey);

    // 4. 清理页码记录
    const lastImageIndexStorage = wx.getStorageSync('lastImageIndex') || {};
    if (lastImageIndexStorage[itemId] !== undefined) {
      delete lastImageIndexStorage[itemId];
      wx.setStorageSync('lastImageIndex', lastImageIndexStorage);
    }

    // 5. 清理本地图片文件
    if (item) {
      if (item.paths && item.paths.length > 0) {
        // 已转换：清理 paths 中的所有图片文件
        item.paths.forEach((filePath) => {
          wx.removeSavedFile({
            filePath: filePath,
            success: () => {
              console.log('删除本地图片成功:', filePath);
            },
            fail: (err) => {
              console.error('删除本地图片失败:', filePath, err);
            }
          });
        });
      } else if (item.path) {
        // 未转换：清理临时文件路径（PDF源文件）
        wx.removeSavedFile({
          filePath: item.path,
          success: () => {
            console.log('删除本地临时文件成功:', item.path);
          },
          fail: (err) => {
            console.error('删除本地临时文件失败:', item.path, err);
          }
        });
      }
    }

    // 6. 清理云端PDF文件（如果是PDF且有云文件ID）
    if (item && item.type === 'pdf' && item.cloudFileId) {
      wx.cloud.deleteFile({
        fileList: [item.cloudFileId],
        success: (res) => {
          console.log('删除云端PDF成功:', res.fileList);
        },
        fail: (err) => {
          console.error('删除云端PDF失败:', err);
        }
      });
    }

    // 7. 清理云端图解记录（如果已同步到云端）
    if (item && item.syncStatus === 'synced') {
      wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: {
          action: 'delete',
          diagramId: item.id
        }
      }).then((res: any) => {
        if (res.result && res.result.success) {
          console.log('删除云端图解成功:', item.id);
        } else {
          console.error('删除云端图解失败:', res.result?.error);
        }
      }).catch((err) => {
        console.error('调用云函数删除图解失败:', err);
      });
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查登录状态变化
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = userInfo && userInfo.isLoggedIn;
    const wasLoggedIn = this.data.isLoggedIn;

    console.log('[Home] onShow - wasLoggedIn:', wasLoggedIn, 'isLoggedIn:', isLoggedIn);

    if (typeof this.getTabBar === 'function' &&
      this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0  // 首页对应tabBar第一个选项，索引为0
      })
    }

    // 如果登录状态从"未登录"变为"已登录"，需要合并数据
    if (!wasLoggedIn && isLoggedIn) {
      console.log('[Home] 检测到登录状态变化，开始合并云端数据...');
      this.setData({ isLoggedIn: true });
      this.handleLoginDataMergeForDiagrams();
    } else if (isLoggedIn) {
      // 已登录用户：检查云端是否有更新（跨设备同步）
      this.checkCloudUpdateAndSync();
    } else {
      // 未登录用户：只加载本地数据
      this.loadLocalData();
    }

    // 检查是否需要展示下拉刷新演示（第2次进入时触发）
    this.checkRefreshDemo();
  },

  /**
   * 检查云端是否有更新并同步（跨设备同步）
   * 使用轻量级检查，只在有更新时才拉取数据
   */
  async checkCloudUpdateAndSync(forceCheck: boolean = false) {
    try {
      const lastSyncTime = wx.getStorageSync(STORAGE_KEYS.LAST_SYNC_TIME) || 0;
      const localDiagramCount = wx.getStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT);
      const lastCheckTime = wx.getStorageSync(STORAGE_KEYS.LAST_CHECK_UPDATE_TIME) || 0;
      const now = Date.now();
      console.log('[Home] checkUpdate - 本地 lastSyncTime:', lastSyncTime, new Date(lastSyncTime).toISOString());
      console.log('[Home] checkUpdate - 本地 syncedDiagramCount:', localDiagramCount);

      // 如果 SYNCED_DIAGRAM_COUNT 未初始化（旧版本升级或首次使用），强制全量同步
      // 否则删除检测无法通过数量对比发现跨设备删除
      if (localDiagramCount === '' || localDiagramCount === undefined || localDiagramCount === null) {
        console.log('[Home] SYNCED_DIAGRAM_COUNT 未初始化，强制全量同步');
        await this.syncDiagramDataFromCloud();
        return;
      }

      // 距离上次 checkUpdate 未超过间隔时间，跳过云端检查，直接使用本地数据
      // forceCheck=true 时跳过缓存（下拉刷新场景）
      if (!forceCheck && now - lastCheckTime < CHECK_UPDATE_INTERVAL) {
        console.log('[Home] checkUpdate - 跳过云端检查，距上次检查仅', Math.round((now - lastCheckTime) / 1000), '秒');
        this.loadLocalData();
        return;
      }

      // 调用云函数检查是否有更新
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: {
          action: 'checkUpdate',
          lastSyncTime,
          localDiagramCount
        }
      }) as any;

      console.log('[Home] checkUpdate - 云端返回:', JSON.stringify(res.result));

      // 记录本次检查时间（无论结果如何，避免频繁调用）
      wx.setStorageSync(STORAGE_KEYS.LAST_CHECK_UPDATE_TIME, Date.now());

      if (res.result && res.result.success) {
        const { hasUpdate, cloudUpdateTime } = res.result.data;
        console.log('[Home] checkUpdate - cloudUpdateTime:', cloudUpdateTime, new Date(cloudUpdateTime).toISOString());
        console.log('[Home] checkUpdate - 比较结果: cloudUpdateTime > lastSyncTime =', cloudUpdateTime > lastSyncTime);

        if (hasUpdate) {
          console.log('[Home] 云端有更新，开始同步数据...');
          await this.syncDiagramDataFromCloud();
        } else {
          console.log('[Home] 云端无更新，使用本地数据');
          this.loadLocalData();
        }
      } else {
        // 检查失败时，降级使用本地数据
        console.log('[Home] checkUpdate - 返回失败，使用本地数据');
        this.loadLocalData();
      }
    } catch (error) {
      console.error('[Home] 检查云端更新失败:', error);
      this.loadLocalData();
    }
  },

  /**
   * 从云端同步图解数据（跨设备同步）
   * 合并云端和本地数据，保留本地独有的未同步图解
   */
  async syncDiagramDataFromCloud() {
    try {
      // 调用云函数获取云端数据
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'sync' }
      }) as any;

      if (!res.result || !res.result.success) {
        console.error('[Home] 同步失败:', res.result?.error);
        this.loadLocalData();
        return;
      }

      const cloudDiagrams = res.result.data.diagrams || [];
      const cloudUpdateTime = res.result.data.cloudUpdateTime || 0;
      console.log('[Home] 云端图解数量:', cloudDiagrams.length);

      // 获取本地图解
      const localImageList = wx.getStorageSync('imageList') || [];
      const localFileList = wx.getStorageSync('fileList') || [];
      const allLocalDiagrams = [...localImageList, ...localFileList];

      // 合并：云端数据优先，但保留本地已有的 paths 和 cover
      const mergedItems = cloudDiagrams.map((cloudItem: any) => {
        const localItem = allLocalDiagrams.find((local: any) => local.id === cloudItem.id);

        console.log('[Home] 合并图解:', cloudItem.name, 'id:', cloudItem.id);
        console.log('[Home] 云端 images:', cloudItem.images?.map((id: any) => id?.split('/').pop()));
        console.log('[Home] 本地 paths:', localItem?.paths?.map((p: any) => p?.split('/').pop()));
        console.log('[Home] 本地 cloudImages:', localItem?.cloudImages?.map((id: any) => id?.split('/').pop()));

        if (localItem && localItem.paths && localItem.paths.length > 0) {
          const localCloudImages = localItem.cloudImages || [];
          const cloudImages = cloudItem.images || [];

          // 用云端顺序重排本地 paths（关键：保持图片顺序同步）
          let reorderedPaths: string[] = [];
          let reorderedCloudImages: string[] = [];

          if (cloudImages.length > 0 && localCloudImages.length > 0 && localItem.paths.length > 0) {
            // 构建映射：cloudId -> localPath
            const cloudIdToLocalPath: Record<string, string> = {};
            for (let i = 0; i < localCloudImages.length && i < localItem.paths.length; i++) {
              if (localCloudImages[i] && localItem.paths[i]) {
                cloudIdToLocalPath[localCloudImages[i]] = localItem.paths[i];
              }
            }

            // 按云端顺序提取本地路径
            // 注意：云端新图片（本地无映射）会返回空字符串，需要标记下载
            const missingCloudIds: string[] = [];
            reorderedPaths = cloudImages
              .map((cloudId: string) => {
                const localPath = cloudIdToLocalPath[cloudId];
                if (!localPath && cloudId) {
                  missingCloudIds.push(cloudId);
                  console.log('[Home] 发现新图片需要下载:', cloudId.split('/').pop());
                }
                return localPath || '';
              });

            // 同步云端顺序
            reorderedCloudImages = cloudImages;

            console.log('[Home] 合并后 paths:', reorderedPaths.map(p => p.split('/').pop()));
            console.log('[Home] 需要下载的新图片数:', missingCloudIds.length);

            // 删除本地多余的图片文件（云端已删除的）
            const deletedCloudIds = localCloudImages.filter((id: string) => id && !cloudImages.includes(id));
            if (deletedCloudIds.length > 0) {
              console.log('[Home] 需删除的本地图片:', deletedCloudIds.map((id: string) => id.split('/').pop()));
              deletedCloudIds.forEach((cloudId: string) => {
                const localPath = cloudIdToLocalPath[cloudId];
                if (localPath) {
                  wx.removeSavedFile({
                    filePath: localPath,
                    success: () => console.log('删除多余图片:', localPath),
                    fail: (err) => console.warn('删除图片失败:', localPath, err)
                  });
                }
              });
            }

            // 如果有新图片需要下载，标记该图解需要同步
            if (missingCloudIds.length > 0) {
              console.log('[Home] 图解', cloudItem.name, '有', missingCloudIds.length, '张新图片需要下载');
            }
          } else if (cloudImages.length > 0) {
            // 本地没有 cloudImages 映射，无法重排，清空 paths 等待详情页下载
            console.log('[Home] 本地无 cloudImages 映射，需要下载所有图片');
            reorderedPaths = [];
            reorderedCloudImages = cloudImages;
          } else {
            // 云端也没有图片，保留本地
            reorderedPaths = localItem.paths;
            reorderedCloudImages = localCloudImages;
          }

          return {
            id: cloudItem.id,
            name: cloudItem.name,
            originalName: cloudItem.originalName,
            path: reorderedPaths.find(p => p) || '',
            paths: reorderedPaths,
            type: cloudItem.type,
            createTime: cloudItem.createTime,
            lastAccessTime: localItem.lastAccessTime || cloudItem.lastAccessTime || cloudItem.createTime,
            cover: localItem.cloudCover !== cloudItem.cover ? '' : (localItem.cover || ''),
            size: cloudItem.size,
            syncStatus: 'synced',
            cloudId: cloudItem._id,
            cloudImages: reorderedCloudImages,
            cloudCover: cloudItem.cover,
            needsCoverDownload: localItem.cloudCover !== cloudItem.cover
          };
        }
        // 本地没有该图解或没有 paths，使用云端数据（使用临时 URL）
        const tempCoverUrl = '';  // 将在 fetchCloudDiagrams 中处理
        return {
          id: cloudItem.id,
          name: cloudItem.name,
          originalName: cloudItem.originalName,
          path: tempCoverUrl,
          paths: [],
          type: cloudItem.type,
          createTime: cloudItem.createTime,
          lastAccessTime: cloudItem.lastAccessTime || cloudItem.createTime,
          cover: tempCoverUrl,
          size: cloudItem.size,
          syncStatus: 'synced',
          cloudId: cloudItem._id,
          cloudImages: cloudItem.images || [],
          cloudCover: cloudItem.cover,
          needsCoverDownload: true  // 需要下载封面
        };
      });

      // 添加本地独有的未同步图解
      const localOnlyDiagrams = allLocalDiagrams.filter(
        (local: any) => !cloudDiagrams.find((cloud: any) => cloud.id === local.id) && local.syncStatus === 'local'
      );
      mergedItems.push(...localOnlyDiagrams);

      // 排序
      sortItems(mergedItems);

      // 获取临时 URL 用于显示封面（只处理需要下载的项）
      const coverFileIds = mergedItems
        .filter((item: any) => item.needsCoverDownload && item.cloudCover)
        .map((item: any) => item.cloudCover);

      let tempUrlMap: Record<string, string> = {};
      if (coverFileIds.length > 0) {
        try {
          const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: coverFileIds });
          tempUrlRes.fileList?.forEach((item: any) => {
            if (item.tempFileURL) {
              tempUrlMap[item.fileID] = item.tempFileURL;
            }
          });
        } catch (e) {
          console.error('[Home] 获取临时 URL 失败:', e);
        }
      }

      // 更新封面 URL
      mergedItems.forEach((item: any) => {
        if (item.cloudCover && !item.cover) {
          item.cover = tempUrlMap[item.cloudCover] || '';
        }
      });

      // 更新列表
      const finalImageList = mergedItems.filter((i: any) => i.type === 'image');
      const finalFileList = mergedItems.filter((i: any) => i.type === 'pdf');

      const finalAllItems = sortItems([...finalImageList, ...finalFileList]);

      this.setData({
        isLoggedIn: true,
        imageList: finalImageList,
        fileList: finalFileList,
        allItems: finalAllItems
      });

      // 保存到本地存储
      wx.setStorageSync('imageList', finalImageList);
      wx.setStorageSync('fileList', finalFileList);

      // 恢复云端计数器和备忘录数据到本地 Storage（跨设备同步关键）
      const countersStorage = wx.getStorageSync('simpleCounters') || {};
      const memosStorage = wx.getStorageSync('itemMemos') || {};
      cloudDiagrams.forEach((cloudItem: any) => {
        // 恢复计数器数据（如果云端有数据且本地没有，或云端数据更新）
        if (cloudItem.counterData && cloudItem.counterData.count !== undefined) {
          const localCount = countersStorage[cloudItem.id];
          const cloudUpdateTime = cloudItem.counterData.updatedAt ? new Date(cloudItem.counterData.updatedAt).getTime() : 0;
          // 本地无数据，或云端更新时间更晚，使用云端数据
          if (localCount === undefined || cloudUpdateTime > 0) {
            countersStorage[cloudItem.id] = cloudItem.counterData.count;
          }
        }
        // 恢复备忘录数据（如果云端有数据且本地没有，或云端数据更新）
        if (cloudItem.memoContent) {
          const localMemo = memosStorage[cloudItem.id];
          const cloudMemoUpdateTime = cloudItem.updatedAt ? new Date(cloudItem.updatedAt).getTime() : 0;
          // 本地无数据，或云端更新时间更晚，使用云端数据
          if (!localMemo || cloudMemoUpdateTime > 0) {
            memosStorage[cloudItem.id] = cloudItem.memoContent;
          }
        }
      });
      wx.setStorageSync('simpleCounters', countersStorage);
      wx.setStorageSync('itemMemos', memosStorage);
      console.log('[Home] 已恢复云端计数器和备忘录数据');

      // 更新同步时间戳和云端数量
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, cloudUpdateTime);
      wx.setStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT, cloudDiagrams.length);
      console.log('[Home] 同步完成，更新时间戳:', cloudUpdateTime, '云端数量:', cloudDiagrams.length);

      // 异步下载封面到本地
      this.downloadCloudCovers(finalAllItems);

      // 检查是否需要显示同步 Tips
      this.checkSyncTips(mergedItems);
    } catch (error) {
      console.error('[Home] 同步图解数据失败:', error);
      this.loadLocalData();
    }
  },

  /**
   * 检查是否需要显示同步 Tips
   */
  checkSyncTips(allItems: FileItem[]) {
    const hasShownSyncTips = wx.getStorageSync('has_shown_sync_tips');
    const firstLocalItem = allItems.find(item => item.syncStatus === 'local' && !item.isBuiltin);
    const showSyncTips = this.data.isLoggedIn && firstLocalItem && !hasShownSyncTips;

    this.setData({
      showSyncTips,
      firstLocalItemId: firstLocalItem?.id || ''
    });
  },

  /**
   * 登录时合并云端和本地图解数据
   * 使用预加载数据（如果已缓存）加速加载
   * 同时下载云端图解的封面到本地（异步执行）
   */
  async handleLoginDataMergeForDiagrams() {
    console.log('[Home] 开始合并云端和本地图解数据...');
    try {
      // 优先使用预加载缓存的数据
      const app = getApp<IAppOption>();
      let cloudDiagrams: FileItem[] = [];

      if (app?.globalData?.preloadedDiagrams && app.globalData.preloadedDiagrams.length > 0) {
        // 使用预加载数据，无需调用云函数
        cloudDiagrams = app.globalData.preloadedDiagrams;
        console.log('[Home] 使用预加载数据:', cloudDiagrams.length);
        // 清除预加载缓存
        app.globalData.preloadedDiagrams = [];
      } else {
        // 无预加载数据，从云端获取
        cloudDiagrams = await this.fetchCloudDiagrams();
        console.log('[Home] 从云端获取数据:', cloudDiagrams.length);
      }

      // 2. 获取本地图解（包括已同步和未同步）
      const localImageList = this.data.imageList;
      const localFileList = this.data.fileList;
      const allLocalDiagrams = [...localImageList, ...localFileList];

      // 3. 合并：云端数据优先，但保留本地已有的 paths 和 cover
      const mergedItems = cloudDiagrams.map(cloudItem => {
        // 查找本地是否有该图解
        const localItem = allLocalDiagrams.find(local => local.id === cloudItem.id);
        if (localItem && localItem.paths && localItem.paths.length > 0) {
          // 本地有 paths，保留本地数据（包括封面）
          return {
            ...cloudItem,
            paths: localItem.paths,
            path: localItem.path || localItem.paths[0],
            cover: localItem.cover || cloudItem.cover,  // 优先使用本地封面
          };
        }
        // 本地没有该图解或没有 paths，使用云端数据
        return cloudItem;
      });

      // 4. 添加本地独有的未同步图解
      const localOnlyDiagrams = allLocalDiagrams.filter(
        local => !cloudDiagrams.find(cloud => cloud.id === local.id) && local.syncStatus === 'local'
      );
      mergedItems.push(...localOnlyDiagrams);

      console.log('[Home] 合并后图解数量:', mergedItems.length);

      // 5. 排序
      sortItems(mergedItems);

      // 6. 更新列表
      let finalImageList = mergedItems.filter(i => i.type === 'image');
      let finalFileList = mergedItems.filter(i => i.type === 'pdf');
      console.log('[Home] 最终图片列表:', finalImageList.length);
      console.log('[Home] 最终文件列表:', finalFileList.length);

      const finalAllItems = sortItems([...finalImageList, ...finalFileList]);

      this.setData({
        imageList: finalImageList,
        fileList: finalFileList,
        allItems: finalAllItems
      });

      // 7. 保存到本地存储
      wx.setStorageSync('imageList', finalImageList);
      wx.setStorageSync('fileList', finalFileList);

      // 8. 更新同步时间戳和云端数量（跨设备同步）
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      wx.setStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT, cloudDiagrams.length);

      // 9. 异步下载云端图解的封面到本地（不影响首屏加载）
      this.downloadCloudCovers(finalAllItems);
    } catch (error) {
      console.error('[Home] 合并图解数据失败:', error);
    }
  },

  /**
   * 异步下载云端图解的封面到本地
   * 优化：使用路径更新语法，避免全量 setData 触发二次渲染
   * @param diagrams 图解列表
   */
  async downloadCloudCovers(diagrams: FileItem[]) {
    // 只处理需要下载封面的项（标记了 needsCoverDownload 或无本地封面）
    const needDownload = diagrams.filter(d =>
      d.syncStatus === 'synced' &&
      d.cloudCover &&
      !isLocalCoverPath(d.cover)  // 非本地路径
    );

    for (const diagram of needDownload) {
      try {
        // 下载封面到本地
        const localCoverPath = await this.downloadCloudImage(diagram.cloudCover!);
        console.log('[Home] 下载封面成功:', diagram.id, localCoverPath);

        // 更新本地 Storage
        const imageList = wx.getStorageSync('imageList') || [];
        const fileList = wx.getStorageSync('fileList') || [];

        const updatedImageList = imageList.map((item: FileItem) => {
          if (item.id === diagram.id) {
            return { ...item, cover: localCoverPath };
          }
          return item;
        });
        const updatedFileList = fileList.map((item: FileItem) => {
          if (item.id === diagram.id) {
            return { ...item, cover: localCoverPath };
          }
          return item;
        });

        wx.setStorageSync('imageList', updatedImageList);
        wx.setStorageSync('fileList', updatedFileList);

        // 使用路径更新，只更新这一个封面，避免全量 setData
        const index = this.data.allItems.findIndex(item => item.id === diagram.id);
        if (index >= 0) {
          this.setData({
            [`allItems[${index}].cover`]: localCoverPath
          });
        }
      } catch (error) {
        console.error('[Home] 下载封面失败:', diagram.id, error);
      }
    }
  },

  getWelcomeDiagramId(): string {
    return WELCOME_DIAGRAM_ID;
  },

  ensureWelcomeDiagram(imageList: FileItem[], fileList: FileItem[]): { imageList: FileItem[]; fileList: FileItem[] } {
    const welcomeId = this.getWelcomeDiagramId();
    const initialized = wx.getStorageSync(WELCOME_INITIALIZED_KEY);

    let hasWelcome = false;
    const normalizedImages = imageList.map(item => {
      if (item.id === welcomeId) {
        hasWelcome = true;
        if (!item.isBuiltin || item.syncStatus !== 'local') {
          return { ...item, isBuiltin: true, syncStatus: 'local' as const };
        }
      }
      return item;
    });

    // 已存在或已初始化过（用户可能已删除），只做标准化，不重新创建
    if (hasWelcome || initialized) {
      return { imageList: normalizedImages, fileList };
    }

    // 首次启动：创建内置图解
    const welcomePath = this.ensureWelcomeImageFile();
    const now = Date.now();
    const welcomeItem: FileItem = {
      id: welcomeId,
      name: WELCOME_DIAGRAM_NAME,
      originalName: WELCOME_DIAGRAM_NAME,
      path: welcomePath,
      paths: [welcomePath],
      type: 'image',
      createTime: now,
      lastAccessTime: now,
      cover: welcomePath,
      syncStatus: 'local',
      isBuiltin: true,
    };

    const newImageList = [...normalizedImages, welcomeItem];
    wx.setStorageSync('imageList', newImageList);
    wx.setStorageSync(WELCOME_INITIALIZED_KEY, true);
    return { imageList: newImageList, fileList };
  },

  ensureWelcomeImageFile(): string {
    const fs = wx.getFileSystemManager();
    const cachedPath = wx.getStorageSync(WELCOME_IMAGE_CACHE_KEY);
    if (cachedPath) {
      try {
        fs.accessSync(cachedPath);
        return cachedPath;
      } catch (err) {
        wx.removeStorageSync(WELCOME_IMAGE_CACHE_KEY);
      }
    }

    try {
      const userDataPath = wx.env?.USER_DATA_PATH;
      if (!userDataPath) {
        return WELCOME_DIAGRAM_ASSET_PATH;
      }
      const targetPath = `${userDataPath}/welcome_zhizhi_letter.png`;
      const fileData = fs.readFileSync(WELCOME_DIAGRAM_ASSET_PATH);
      fs.writeFileSync(targetPath, fileData);
      wx.setStorageSync(WELCOME_IMAGE_CACHE_KEY, targetPath);
      return targetPath;
    } catch (error) {
      console.error('[Home] 复制内置图解失败:', error);
      return WELCOME_DIAGRAM_ASSET_PATH;
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 关闭导入选项弹出层
    this.setData({ showImportOptions: false });
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = userInfo && userInfo.isLoggedIn;

    if (isLoggedIn) {
      // 已登录用户：刷新时触发云端同步（强制跳过缓存）
      this.checkCloudUpdateAndSync(true).then(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      // 未登录用户：只刷新本地数据
      this.loadLocalData();
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '毛线时光，有我陪伴',
      path: '/pages/home/home',
      imageUrl: '/assets/share.png'
    }
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
   * 导航到图解详情页
   */
  navigateToDetail(e: any) {
    const id = e.currentTarget.dataset.id;

    // 更新最后操作时间
    const now = Date.now();
    const imageList = this.data.imageList.map(item => {
      if (item.id === id) {
        return { ...item, lastAccessTime: now };
      }
      return item;
    });
    const fileList = this.data.fileList.map(item => {
      if (item.id === id) {
        return { ...item, lastAccessTime: now };
      }
      return item;
    });

    // 更新 Storage
    wx.setStorageSync('imageList', imageList);
    wx.setStorageSync('fileList', fileList);

    // 同步 lastAccessTime 到云端（异步，不阻塞导航）
    const currentItem = this.data.allItems.find(item => item.id === id);
    if (this.data.isLoggedIn && currentItem?.syncStatus === 'synced') {
      wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: {
          action: 'updateInfo',
          diagramId: id,
          lastAccessTime: now
        }
      }).catch(err => console.warn('[Home] 同步 lastAccessTime 失败:', err));
    }

    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  /**
   * 导航到编辑图解页
   */
  navigateToEdit() {
    const { currentItemId } = this.data;
    wx.navigateTo({
      url: `/pages/edit/edit?id=${currentItemId}`
    });
  },

  /**
   * 处理登录引导弹窗按钮点击
   */
  handleLoginDialogButtonClick(e: any) {
    const index = e.detail.index;

    if (index === 0) {
      // 点击取消按钮
      this.setData({ showLoginPrompt: false });
    } else if (index === 1) {
      // 点击去登录按钮
      this.setData({ showLoginPrompt: false });
      wx.switchTab({ url: '/pages/me/me' });
    }
  },

  /**
   * 同步图解到云端
   * 将本地图解上传到云端，保留本地文件供用户继续使用
   * 退出登录时会清理已同步的本地文件
   */
  async syncDiagramToCloud(e: any) {
    const itemId = e.currentTarget.dataset.id;
    const item = this.data.allItems.find(i => i.id === itemId);

    if (item?.isBuiltin) {
      this.showToast('该图解无需同步');
      return;
    }

    if (!item || item.syncStatus !== 'local') {
      this.showToast('该图解已同步或不存在');
      return;
    }

    // 检查 PDF 是否已转换（paths 为空表示未转换）
    if (item.type === 'pdf' && (!item.paths || item.paths.length === 0)) {
      wx.showModal({
        title: '提示',
        content: '请先打开此图解，加载完成后再同步',
        confirmText: '去打开',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/detail/detail?id=${itemId}`
            });
          }
        }
      });
      return;
    }

    // 检查图片类型是否有内容
    if (item.type === 'image' && (!item.paths || item.paths.length === 0)) {
      this.showToast('图解内容为空，无法同步');
      return;
    }

    // 添加到正在同步状态，显示旋转动画
    this.setData({
      syncingStatus: { ...this.data.syncingStatus, [itemId]: true }
    });

    // 校验数量限制（云端已同步数 + 待同步数）
    const cloudCount = await this.getCloudDiagramCount();
    if (cloudCount >= 10) {
      const newStatus = { ...this.data.syncingStatus };
      delete newStatus[itemId];
      this.setData({ syncingStatus: newStatus });
      wx.showToast({ title: '暂时最多支持同步10个图解', icon: 'none' });
      return;
    }

    try {
      // 上传到云端，获取云端记录ID和cloudImages
      const uploadResult = await this.uploadDiagramToCloud(item);

      // 不删除本地文件，保留供用户继续使用
      // 退出登录时会清理已同步的本地文件

      // 更新本地项的 syncStatus 为 synced，保留原有 paths，保存 cloudImages
      const updatedImageList: FileItem[] = this.data.imageList.map(i => {
        if (i.id === itemId) {
          return { ...i, syncStatus: 'synced' as const, cloudId: uploadResult?.cloudId, cloudImages: uploadResult?.cloudImages };
        }
        return i;
      });
      const updatedFileList: FileItem[] = this.data.fileList.map(i => {
        if (i.id === itemId) {
          return { ...i, syncStatus: 'synced' as const, cloudId: uploadResult?.cloudId, cloudImages: uploadResult?.cloudImages };
        }
        return i;
      });

      const allItems = sortItems([...updatedImageList, ...updatedFileList]);

      // 移除同步状态
      const newStatus = { ...this.data.syncingStatus };
      delete newStatus[itemId];

      this.setData({
        imageList: updatedImageList,
        fileList: updatedFileList,
        allItems,
        syncingStatus: newStatus
      });

      // 更新本地存储
      wx.setStorageSync('imageList', updatedImageList);
      wx.setStorageSync('fileList', updatedFileList);

      // 更新同步时间戳和数量（跨设备同步）
      wx.setStorageSync(STORAGE_KEYS.LAST_SYNC_TIME, Date.now());
      const prevCount = wx.getStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT);
      wx.setStorageSync(STORAGE_KEYS.SYNCED_DIAGRAM_COUNT, (prevCount || 0) + 1);

      wx.showToast({ title: '已经同步完成', icon: 'success', duration: 1000 });
    } catch (error) {
      // 移除同步状态
      const newStatus = { ...this.data.syncingStatus };
      delete newStatus[itemId];
      this.setData({ syncingStatus: newStatus });

      console.error('同步失败:', error);
      this.showToast('同步失败，请重试');
    }
  },

  /**
   * 从云端获取图解列表
   * 使用临时 URL 显示封面，不下载文件（优化加载速度）
   * 保留云端的 images 字段（云文件ID数组），用于详情页下载
   */
  async fetchCloudDiagrams(): Promise<FileItem[]> {
    console.log('[Home] 开始从云端获取图解列表...');
    try {
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'download' }
      }) as any;

      console.log('[Home] 云函数返回结果:', res.result);

      if (res.result && res.result.success && res.result.data.diagrams) {
        const cloudDiagrams = res.result.data.diagrams;
        console.log('[Home] 云端原始图解数量:', cloudDiagrams.length);

        // 批量获取所有封面的临时 URL（并行，大幅提升速度）
        const coverFileIds = cloudDiagrams
          .filter((item: any) => item.cover)
          .map((item: any) => item.cover);

        let tempUrlMap: Record<string, string> = {};
        if (coverFileIds.length > 0) {
          try {
            const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: coverFileIds });
            tempUrlRes.fileList?.forEach((item: any) => {
              if (item.tempFileURL) {
                tempUrlMap[item.fileID] = item.tempFileURL;
              }
            });
            console.log('[Home] 获取临时 URL 成功:', Object.keys(tempUrlMap).length);
          } catch (e) {
            console.error('[Home] 获取临时 URL 失败:', e);
          }
        }

        // 构建图解列表
        const diagrams: FileItem[] = cloudDiagrams.map((cloudItem: any) => {
          const tempCoverUrl = tempUrlMap[cloudItem.cover] || '';
          return {
            id: cloudItem.id,
            name: cloudItem.name,
            originalName: cloudItem.originalName,
            path: tempCoverUrl,  // 使用临时 URL，不下载
            paths: [],  // 图片不立即下载，详情页需要时再下载
            type: cloudItem.type,
            createTime: cloudItem.createTime,
            cover: tempCoverUrl,  // 使用临时 URL 显示封面
            size: cloudItem.size,  // 文件大小，用于去重
            syncStatus: 'synced',
            cloudId: cloudItem._id,
            cloudImages: cloudItem.images || [],  // 保留云端图片 ID，用于详情页下载
            cloudCover: cloudItem.cover  // 保留云端封面 ID，用于详情页下载
          };
        });

        // 恢复计数器和备忘录数据到本地 Storage
        const countersStorage = wx.getStorageSync('simpleCounters') || {};
        const memosStorage = wx.getStorageSync('itemMemos') || {};
        cloudDiagrams.forEach((cloudItem: any) => {
          // 恢复计数器数据（如果云端有数据）
          if (cloudItem.counterData && cloudItem.counterData.count !== undefined) {
            // 只在本地没有数据时才恢复，避免覆盖本地更新
            if (countersStorage[cloudItem.id] === undefined) {
              countersStorage[cloudItem.id] = cloudItem.counterData.count;
            }
          }
          // 恢复备忘录数据（如果云端有数据）
          if (cloudItem.memoContent) {
            // 只在本地没有数据时才恢复
            if (memosStorage[cloudItem.id] === undefined) {
              memosStorage[cloudItem.id] = cloudItem.memoContent;
            }
          }
        });
        wx.setStorageSync('simpleCounters', countersStorage);
        wx.setStorageSync('itemMemos', memosStorage);
        console.log('[Home] 已恢复云端计数器和备忘录数据');

        console.log('[Home] 处理后图解数量:', diagrams.length);
        return diagrams;
      }
      console.log('[Home] 云端没有图解数据');
      return [];
    } catch (error) {
      console.error('[Home] 获取云端图解失败:', error);
      return [];
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
          // 保存到本地持久化存储
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success: (saveRes) => {
              resolve(saveRes.savedFilePath);
            },
            fail: (err) => {
              reject(err);
            }
          });
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 删除图解关联的所有本地文件
   */
  removeDiagramFiles(item: FileItem) {
    // 删除图片文件
    if (item.paths && item.paths.length > 0) {
      item.paths.forEach((filePath) => {
        wx.removeSavedFile({
          filePath,
          success: () => console.log('删除图片成功:', filePath),
          fail: (err) => console.error('删除图片失败:', filePath, err)
        });
      });
    }
    // 删除封面文件（如果与 paths 不同）
    if (item.cover && item.cover !== item.paths?.[0]) {
      wx.removeSavedFile({
        filePath: item.cover,
        success: () => console.log('删除封面成功:', item.cover),
        fail: (err) => console.error('删除封面失败:', item.cover, err)
      });
    }
    // 删除 PDF 源文件
    if (item.pdfSourcePath) {
      wx.removeSavedFile({
        filePath: item.pdfSourcePath,
        success: () => console.log('删除PDF源文件成功:', item.pdfSourcePath),
        fail: (err) => console.error('删除PDF源文件失败:', item.pdfSourcePath, err)
      });
    }
  },
})
