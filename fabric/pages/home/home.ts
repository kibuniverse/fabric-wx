// pages/home/home.ts

interface FileItem {
  id: string;
  name: string;
  originalName: string;
  path: string;          // 保留兼容旧数据，取 paths[0]
  paths: string[];       // 多图片路径数组
  type: 'image' | 'pdf';
  createTime: number;
  cover?: string;        // 自定义封面图片路径
  pdfSourcePath?: string; // PDF源文件路径（如果是从PDF转换来的）
  pdfPageCount?: number; // PDF总页数
  size?: number;         // 文件大小（字节），用于去重
  cloudFileId?: string;  // 云端PDF文件ID（用于删除时清理云端数据）

  // 云同步相关字段
  syncStatus?: 'local' | 'synced';  // 同步状态：local=本地未同步，synced=已同步云端
  cloudId?: string;  // 云端记录ID（synced 时有值）
}

// 通用的提示配置
const TOAST_CONFIG = {
  icon: "none" as const,
  duration: 1500,
};

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
    imageList = imageList.map(item => ({
      ...item,
      syncStatus: item.syncStatus || 'local'  // 旧数据默认为 local
    }));
    fileList = fileList.map(item => ({
      ...item,
      syncStatus: item.syncStatus || 'local'  // 旧数据默认为 local
    }));

    // 合并并按创建时间排序
    const allItems = [...imageList, ...fileList].sort((a, b) => b.createTime - a.createTime);
    console.log('All Items:', allItems, imageList, fileList);

    // 检查是否需要显示同步 Tips
    const hasShownSyncTips = wx.getStorageSync('has_shown_sync_tips');
    const firstLocalItem = allItems.find(item => item.syncStatus === 'local');
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
   * 切换导入选项显示状态
   * 如果用户未登录且已有1个图解，显示登录引导弹窗
   * 如果用户已登录且云端已有5个图解，提示限制
   */
  async toggleImportOptions() {
    const isLoggedIn = this.data.isLoggedIn;

    if (!isLoggedIn) {
      // 未登录：检查本地图解数量（syncStatus='local' 的数量）
      const localCount = this.data.allItems.filter(item => item.syncStatus === 'local').length;
      if (localCount >= 1) {
        this.setData({ showLoginPrompt: true });
        return;
      }
    } else {
      // 已登录：检查云端数量
      const cloudCount = await this.getCloudDiagramCount();
      if (cloudCount >= 5) {
        wx.showToast({ title: '最多只能上传五个图解', icon: 'none' });
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
      sizeType: ['original', 'compressed'],
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
          showNameModal: true
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
    const newItem: FileItem = {
      id: this.generateUniqueId(),
      name: diagramName,
      originalName: diagramName,
      path: pendingImages[0], // 兼容旧数据
      paths: pendingImages,
      type: 'image',
      createTime: Date.now(),
      cover: pendingImages[0], // 第一张图片作为默认封面
      syncStatus: isLoggedIn ? 'synced' : 'local'  // 根据登录状态设置
    };

    // 已登录时，上传到云端
    if (isLoggedIn) {
      try {
        await this.uploadDiagramToCloud(newItem);
      } catch (error) {
        console.error('上传图解到云端失败:', error);
        // 上传失败时，改为本地存储
        newItem.syncStatus = 'local';
        wx.showToast({ title: '云同步失败，已保存本地', icon: 'none' });
      }
    }

    // 更新图片列表
    const updatedImageList = [...this.data.imageList, newItem];
    const allItems = [...updatedImageList, ...this.data.fileList].sort((a, b) => b.createTime - a.createTime);

    this.setData({
      imageList: updatedImageList,
      allItems,
      showNameModal: false,
      pendingImages: [],
      diagramName: ''
    });

    // 保存到本地存储
    wx.setStorageSync('imageList', updatedImageList);
    wx.hideLoading();
    this.showToast(`已创建图解，包含${pendingImages.length}张图片`);
  },

  /**
   * 上传图解到云端
   * @param item 图解项目
   */
  async uploadDiagramToCloud(item: FileItem): Promise<string | null> {
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

      // 2. 调用云函数保存记录
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
            images: cloudImages
          }
        }
      }) as any;

      if (res.result && res.result.success) {
        return res.result.data.cloudId;
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
          createTime: Date.now(),
          syncStatus: 'local'  // PDF 转换后再同步
        };

        // 更新文件列表
        const updatedFileList = [...this.data.fileList, newItem];
        const allItems = [...this.data.imageList, ...updatedFileList].sort((a, b) => b.createTime - a.createTime);

        this.setData({
          fileList: updatedFileList,
          allItems
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
        currentItemName: currentItem.originalName || currentItem.name
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
      newItemName: this.data.currentItemName
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
  updateCover(itemId: string, itemType: string, coverPath: string) {
    if (itemType === 'image') {
      const updatedList = this.data.imageList.map(item => {
        if (item.id === itemId) {
          return { ...item, cover: coverPath };
        }
        return item;
      });

      const allItems = [...updatedList, ...this.data.fileList].sort((a, b) => b.createTime - a.createTime);

      this.setData({
        imageList: updatedList,
        allItems
      });

      wx.setStorageSync('imageList', updatedList);
    } else {
      const updatedList = this.data.fileList.map(item => {
        if (item.id === itemId) {
          return { ...item, cover: coverPath };
        }
        return item;
      });

      const allItems = [...this.data.imageList, ...updatedList].sort((a, b) => b.createTime - a.createTime);

      this.setData({
        fileList: updatedList,
        allItems
      });

      wx.setStorageSync('fileList', updatedList);
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
        showRenameModal: false
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
    
    // 更新对应列表中的项目名称
    if (currentItemType === 'image') {
      const updatedList = this.data.imageList.map(item => {
        if (item.id === currentItemId) {
          return { ...item, name: newItemName };
        }
        return item;
      });
      
      // 重新计算合并列表
      const allItems = [...updatedList, ...this.data.fileList].sort((a, b) => b.createTime - a.createTime);
      
      this.setData({
        imageList: updatedList,
        allItems,
        showRenameModal: false
      });
      
      // 更新本地存储
      wx.setStorageSync('imageList', updatedList);
    } else {
      const updatedList = this.data.fileList.map(item => {
        if (item.id === currentItemId) {
          return { ...item, name: newItemName };
        }
        return item;
      });
      
      // 重新计算合并列表
      const allItems = [...this.data.imageList, ...updatedList].sort((a, b) => b.createTime - a.createTime);
      
      this.setData({
        fileList: updatedList,
        allItems,
        showRenameModal: false
      });
      
      // 更新本地存储
      wx.setStorageSync('fileList', updatedList);
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
    const updatedImageList = this.data.imageList.filter(item => item.id !== currentItemId);
    const updatedFileList = this.data.fileList.filter(item => item.id !== currentItemId);

    // 重新计算合并列表
    const allItems = [...updatedImageList, ...updatedFileList].sort((a, b) => b.createTime - a.createTime);

    this.setData({
      imageList: updatedImageList,
      fileList: updatedFileList,
      allItems,
      showDeleteModal: false
    });

    // 更新本地存储
    wx.setStorageSync('imageList', updatedImageList);
    wx.setStorageSync('fileList', updatedFileList);

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
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查登录状态变化
    const userInfo = wx.getStorageSync('userInfo');
    const isLoggedIn = userInfo && userInfo.isLoggedIn;
    const wasLoggedIn = this.data.isLoggedIn;

    // 刷新数据，确保从其他页面返回时能看到最新封面
    this.loadLocalData();

    // 如果登录状态从"未登录"变为"已登录"，需要合并数据
    if (!wasLoggedIn && isLoggedIn) {
      this.handleLoginDataMergeForDiagrams();
    }

    if (typeof this.getTabBar === 'function' &&
      this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0  // 首页对应tabBar第一个选项，索引为0
      })
    }
  },

  /**
   * 登录时合并云端和本地图解数据
   */
  async handleLoginDataMergeForDiagrams() {
    try {
      // 1. 从云端拉取数据
      const cloudDiagrams = await this.fetchCloudDiagrams();

      // 2. 获取本地图解（syncStatus='local'）
      const localDiagrams = this.data.allItems.filter(i => i.syncStatus === 'local');

      // 3. 合并：云端数据 + 本地未同步数据
      const mergedItems = [...cloudDiagrams, ...localDiagrams].sort((a, b) => b.createTime - a.createTime);

      // 4. 更新列表
      this.setData({
        imageList: mergedItems.filter(i => i.type === 'image'),
        fileList: mergedItems.filter(i => i.type === 'pdf'),
        allItems: mergedItems
      });

      // 5. 保存到本地存储
      wx.setStorageSync('imageList', this.data.imageList);
      wx.setStorageSync('fileList', this.data.fileList);
    } catch (error) {
      console.error('合并图解数据失败:', error);
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
    // 刷新数据
    this.loadLocalData();
    wx.stopPullDownRefresh();
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
   * 将本地图解上传到云端，然后删除本地记录和文件
   */
  async syncDiagramToCloud(e: any) {
    const itemId = e.currentTarget.dataset.id;
    const item = this.data.allItems.find(i => i.id === itemId);

    if (!item || item.syncStatus !== 'local') {
      this.showToast('该图解已同步或不存在');
      return;
    }

    // 检查 PDF 是否已转换（paths 为空表示未转换）
    if (item.type === 'pdf' && (!item.paths || item.paths.length === 0)) {
      wx.showModal({
        title: '提示',
        content: '请先打开此图解，完成 PDF 转换后再同步',
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

    // 校验数量限制（云端已同步数 + 待同步数）
    const cloudCount = await this.getCloudDiagramCount();
    if (cloudCount >= 5) {
      wx.showToast({ title: '最多只能上传五个图解', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '同步中...', mask: true });

    try {
      // 上传到云端
      await this.uploadDiagramToCloud(item);

      // 删除本地文件
      this.removeDiagramFiles(item);

      // 从本地列表中删除
      const updatedImageList = this.data.imageList.filter(i => i.id !== itemId);
      const updatedFileList = this.data.fileList.filter(i => i.id !== itemId);

      // 从云端重新拉取数据
      const cloudDiagrams = await this.fetchCloudDiagrams();

      // 合并：云端数据 + 本地未同步数据
      const localDiagrams = [...updatedImageList, ...updatedFileList].filter(i => i.syncStatus === 'local');
      const mergedItems = [...cloudDiagrams, ...localDiagrams].sort((a, b) => b.createTime - a.createTime);

      this.setData({
        imageList: mergedItems.filter(i => i.type === 'image'),
        fileList: mergedItems.filter(i => i.type === 'pdf'),
        allItems: mergedItems
      });

      // 更新本地存储
      wx.setStorageSync('imageList', this.data.imageList);
      wx.setStorageSync('fileList', this.data.fileList);

      wx.hideLoading();
      wx.showToast({ title: '已经同步完成', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      console.error('同步失败:', error);
      this.showToast('同步失败，请重试');
    }
  },

  /**
   * 从云端获取图解列表
   */
  async fetchCloudDiagrams(): Promise<FileItem[]> {
    try {
      const res = await wx.cloud.callFunction({
        name: 'syncDiagramData',
        data: { action: 'download' }
      }) as any;

      if (res.result && res.result.success && res.result.data.diagrams) {
        // 转换云端数据为本地格式
        const diagrams: FileItem[] = [];
        for (const cloudItem of res.result.data.diagrams) {
          // 下载封面图片到本地
          let localCover = '';
          if (cloudItem.cover) {
            try {
              localCover = await this.downloadCloudImage(cloudItem.cover);
            } catch (e) {
              console.error('下载封面失败:', e);
            }
          }

          diagrams.push({
            id: cloudItem.id,
            name: cloudItem.name,
            originalName: cloudItem.originalName,
            path: localCover,
            paths: [],  // 云端图片不下载到本地，详情页需要时再下载
            type: cloudItem.type,
            createTime: cloudItem.createTime,
            cover: localCover,
            syncStatus: 'synced',
            cloudId: cloudItem._id
          });
        }
        return diagrams;
      }
      return [];
    } catch (error) {
      console.error('获取云端图解失败:', error);
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