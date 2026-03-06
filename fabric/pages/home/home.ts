// pages/home/home.ts

interface FileItem {
  id: string;
  name: string;
  originalName: string;
  path: string;          // 保留兼容旧数据，取 paths[0]
  paths: string[];       // 多图片路径数组
  type: 'image' | 'pdf';
  createTime: number;
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
    showImportOptions: false, // 是否显示导入选项弹出层
    imageList: [] as FileItem[], // 图片列表
    fileList: [] as FileItem[], // 文件列表
    allItems: [] as FileItem[], // 合并后的所有项目
    
    // ActionSheet相关
    showActionSheet: false, // 是否显示操作菜单
    actions: [
      { text: '重命名', value: 'rename' },
      { text: '删除', value: 'delete', type: 'warn' },
    ],
    
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
    ]
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
   */
  loadLocalData() {
    const imageList = wx.getStorageSync('imageList') || [];
    const fileList = wx.getStorageSync('fileList') || [];
    
    // 合并并按创建时间排序
    const allItems = [...imageList, ...fileList].sort((a, b) => b.createTime - a.createTime);
    console.log('All Items:', allItems,imageList,fileList);
    this.setData({
      imageList,
      fileList,
      allItems
    });
  },

  /**
   * 切换导入选项显示状态
   */
  toggleImportOptions() {
    this.setData({
      showImportOptions: !this.data.showImportOptions
    });
  },

  /**
   * 选择并导入图片
   */
  chooseImage() {
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
      success: (res) => {
        // 保存待命名的图片路径
        const pendingImages = res.tempFiles.map(file => file.tempFilePath);

        // 生成默认名称（取第一张图片的文件名）
        const firstFileName = pendingImages[0].split('/').pop() || '未命名图解';
        const defaultName = firstFileName.length > 10 ? firstFileName.substring(0, 7) + '...' : firstFileName;

        this.setData({
          pendingImages,
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
  confirmCreateDiagram() {
    const { pendingImages, diagramName } = this.data;

    if (!diagramName.trim()) {
      this.showToast('名称不能为空');
      return;
    }

    if (pendingImages.length === 0) {
      this.showToast('未选择图片');
      return;
    }

    // 创建单个图解项目，包含多张图片
    const newItem: FileItem = {
      id: this.generateUniqueId(),
      name: diagramName,
      originalName: diagramName,
      path: pendingImages[0], // 兼容旧数据
      paths: pendingImages,
      type: 'image',
      createTime: Date.now()
    };

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
    this.showToast(`已创建图解，包含${pendingImages.length}张图片`);
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
      count: 9,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        // 处理选择的PDF文件
        const newFiles: FileItem[] = res.tempFiles.map(file => {
          return {
            id: this.generateUniqueId(),
            name: file.name.length > 10 ? file.name.substring(0, 7) + '...' : file.name,
            originalName: file.name,
            path: file.path,
            type: 'pdf',
            createTime: Date.now()
          };
        });

        // 更新文件列表
        const updatedFileList = [...this.data.fileList, ...newFiles];
        const allItems = [...this.data.imageList, ...updatedFileList].sort((a, b) => b.createTime - a.createTime);
        
        this.setData({
          fileList: updatedFileList,
          allItems
        });

        // 保存到本地存储
        wx.setStorageSync('fileList', updatedFileList);
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
      this.setData({
        showActionSheet: true,
        currentItemId: id,
        currentItemType: type,
        currentItemName: currentItem.originalName
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
    const { currentItemId, currentItemType } = this.data;
    console.log('Current Item ID:', currentItemId, 'Current Item Type:', currentItemType, this.data.imageList, this.data.fileList);

    // 清理该项目关联的计数器和备忘录数据
    this.cleanupItemData(currentItemId);

    // 从对应列表中删除项目
    if (currentItemType === 'image') {
      const updatedList = this.data.imageList.filter(item => item.id !== currentItemId);

      // 重新计算合并列表
      const allItems = [...updatedList, ...this.data.fileList].sort((a, b) => b.createTime - a.createTime);

      this.setData({
        imageList: updatedList,
        allItems,
        showDeleteModal: false
      });

      // 更新本地存储
      wx.setStorageSync('imageList', updatedList);
    } else {
      const updatedList = this.data.fileList.filter(item => item.id !== currentItemId);

      // 重新计算合并列表
      const allItems = [...this.data.imageList, ...updatedList].sort((a, b) => b.createTime - a.createTime);

      this.setData({
        fileList: updatedList,
        allItems,
        showDeleteModal: false
      });

      // 更新本地存储
      wx.setStorageSync('fileList', updatedList);
    }

    this.showToast('删除成功');
  },

  /**
   * 清理项目关联的数据（计数器、备忘录等）
   */
  cleanupItemData(itemId: string) {
    // 清理计数器数据
    const countersStorage = wx.getStorageSync('simpleCounters') || {};
    if (countersStorage[itemId] !== undefined) {
      delete countersStorage[itemId];
      wx.setStorageSync('simpleCounters', countersStorage);
    }

    // 清理备忘录数据
    const memosStorage = wx.getStorageSync('itemMemos') || {};
    if (memosStorage[itemId] !== undefined) {
      delete memosStorage[itemId];
      wx.setStorageSync('itemMemos', memosStorage);
    }

    // 清理备忘录修改时间
    const lastModifiedKey = `memo_${itemId}_lastModified`;
    wx.removeStorageSync(lastModifiedKey);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (typeof this.getTabBar === 'function' &&
      this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0  // 首页对应tabBar第一个选项，索引为0
      })
    }
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
      title: '图片与文件管理',
      path: '/pages/home/home'
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
})