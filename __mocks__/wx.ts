/**
 * 微信小程序 API Mock
 */
const wx = {
  cloud: {
    uploadFile: jest.fn(),
    getTempFileURL: jest.fn(),
    deleteFile: jest.fn(),
  },
  request: jest.fn(),
  downloadFile: jest.fn(),
  saveFile: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
};

export default wx;