/**
 * 微信小程序 API Mock
 */

// 创建可复用的 mock 函数
const mockCloudCallFunction = jest.fn();
const mockCloudUploadFile = jest.fn();
const mockCloudGetTempFileURL = jest.fn();
const mockCloudDownloadFile = jest.fn();
const mockCloudDeleteFile = jest.fn();

const mockGetStorageSync = jest.fn();
const mockSetStorageSync = jest.fn();
const mockRemoveStorageSync = jest.fn();

const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockShowToast = jest.fn();
const mockShowModal = jest.fn();

const mockChooseMedia = jest.fn();
const mockChooseMessageFile = jest.fn();
const mockSaveFile = jest.fn();
const mockRemoveSavedFile = jest.fn();
const mockCompressImage = jest.fn();

const mockNavigateTo = jest.fn();
const mockSwitchTab = jest.fn();

// 存储模拟数据
const storageData: Record<string, any> = {};

// 默认 mock 实现
mockGetStorageSync.mockImplementation((key: string) => storageData[key]);
mockSetStorageSync.mockImplementation((key: string, value: any) => {
  storageData[key] = value;
});
mockRemoveStorageSync.mockImplementation((key: string) => {
  delete storageData[key];
});

const wx = {
  // 云开发 API
  cloud: {
    callFunction: mockCloudCallFunction,
    uploadFile: mockCloudUploadFile,
    getTempFileURL: mockCloudGetTempFileURL,
    downloadFile: mockCloudDownloadFile,
    deleteFile: mockCloudDeleteFile,
    init: jest.fn(),
  },

  // 存储 API
  getStorageSync: mockGetStorageSync,
  setStorageSync: mockSetStorageSync,
  removeStorageSync: mockRemoveStorageSync,

  // UI API
  showLoading: mockShowLoading,
  hideLoading: mockHideLoading,
  showToast: mockShowToast,
  showModal: mockShowModal,

  // 文件 API
  chooseMedia: mockChooseMedia,
  chooseMessageFile: mockChooseMessageFile,
  saveFile: mockSaveFile,
  removeSavedFile: mockRemoveSavedFile,
  compressImage: mockCompressImage,

  // 导航 API
  navigateTo: mockNavigateTo,
  switchTab: mockSwitchTab,

  // 其他
  stopPullDownRefresh: jest.fn(),
  request: jest.fn(),
  downloadFile: jest.fn(),
};

// 导出 mock 函数供测试使用
export const mocks = {
  cloudCallFunction: mockCloudCallFunction,
  cloudUploadFile: mockCloudUploadFile,
  cloudGetTempFileURL: mockCloudGetTempFileURL,
  cloudDownloadFile: mockCloudDownloadFile,
  cloudDeleteFile: mockCloudDeleteFile,
  getStorageSync: mockGetStorageSync,
  setStorageSync: mockSetStorageSync,
  removeStorageSync: mockRemoveStorageSync,
  showLoading: mockShowLoading,
  hideLoading: mockHideLoading,
  showToast: mockShowToast,
  showModal: mockShowModal,
  chooseMedia: mockChooseMedia,
  chooseMessageFile: mockChooseMessageFile,
  saveFile: mockSaveFile,
  removeSavedFile: mockRemoveSavedFile,
  compressImage: mockCompressImage,
  navigateTo: mockNavigateTo,
  switchTab: mockSwitchTab,
  storageData,
};

// 清理所有 mock 和存储数据的方法
export const clearAllMocks = () => {
  jest.clearAllMocks();
  Object.keys(storageData).forEach(key => delete storageData[key]);
};

export default wx;