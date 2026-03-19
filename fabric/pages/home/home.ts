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
      createTime: Date.now(),
      cover: pendingImages[0] // 第一张图片作为默认封面
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
          // 高亮显示已存在的项目
          this.setData({
            highlightItemId: duplicate.id
          });

          // 2秒后取消高亮
          setTimeout(() => {
            this.setData({ highlightItemId: '' });
          }, 2000);

          this.showToast('该PDF已存在，请勿重复上传');
          return;
        }

        const fileName = file.name.length > 10 ? file.name.substring(0, 7) + '...' : file.name;

        // 创建PDF项目，保存到fileList，转换将在detail页面首次打开时进行
        const newItem: FileItem = {
          id: this.generateUniqueId(),
          name: fileName,
          originalName: file.name,
          path: file.path,
          paths: [], // 初始为空，转换后填充
          type: 'pdf',
          size: file.size, // 保存文件大小用于去重
          createTime: Date.now()
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
        this.showToast('PDF已添加，首次打开时将转换为图片');
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

    // 清理该项目关联的计数器和备忘录数据
    this.cleanupItemData(currentItemId);

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
})