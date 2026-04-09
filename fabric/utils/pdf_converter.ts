/**
 * PDF转换工具
 * 使用微信云开发 + 腾讯云数据万象服务
 */


/**
 * 上传PDF到云存储
 * @param localPath PDF本地临时路径
 * @param fileId 文件唯一标识
 * @returns 云文件ID
 */
export function uploadPdfToCloud(localPath: string, fileId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cloudPath = `pdfs/${fileId}.pdf`;

    wx.cloud.uploadFile({
      cloudPath,
      filePath: localPath,
      success: (res) => {
        console.log('PDF上传成功:', res.fileID);
        resolve(res.fileID);
      },
      fail: (err) => {
        console.error('PDF上传失败:', err);
        reject(new Error('PDF上传失败'));
      }
    });
  });
}

/**
 * 获取PDF预览图片URL
 * @param fileID 云文件ID
 * @param page 页码（从1开始）
 * @returns 预览图片URL
 */
export function getPdfPreviewUrl(fileID: string, page: number): string {
  // 腾讯云数据万象文档预览接口
  return `${fileID}?ci-process=doc-preview&dstType=jpg&page=${page}`;
}

/**
 * 获取PDF总页数
 * 通过尝试获取不同页码的图片来判断总页数
 * @param fileID 云文件ID
 * @returns PDF总页数
 */
export function getPdfPageCount(fileID: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // 使用云开发的云文件ID获取临时URL来检测页数
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: async (res) => {
        if (res.fileList && res.fileList.length > 0) {
          const tempFileURL = res.fileList[0].tempFileURL;
          const previewUrl = `${tempFileURL}&ci-process=doc-preview&page=1`;
          wx.request({
            url: previewUrl,
            method: "HEAD",
            success: (res) => {
              console.log('res.header', res.header, JSON.stringify(res.header))
              const pageCount = res.header['x-total-page'] || res.header['X-Total-Page']
              resolve(pageCount);
            },
            fail: () => {
              resolve(0);
            }
          });

        } else {
          reject(new Error('获取临时URL失败'));
        }
      },
      fail: (err) => {
        console.error('获取临时URL失败:', err);
        reject(new Error('获取临时URL失败'));
      }
    });
  });
}


/**
 * 下载图片到本地并持久化保存
 * @param url 图片URL
 * @returns 本地持久化文件路径
 */
export function downloadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) {
          // 持久化保存，避免临时文件过期
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success: (saveRes) => {
              resolve(saveRes.savedFilePath);
            },
            fail: (err) => {
              console.error('保存图片失败:', err);
              reject(new Error('本地存储空间不足'));
            }
          });
        } else {
          reject(new Error(`下载失败: ${res.statusCode}`));
        }
      },
      fail: (err) => {
        console.error('图片下载失败:', err);
        reject(new Error('图片下载失败'));
      }
    });
  });
}

/**
 * 继续加载PDF缺失的页面
 * 用于部分加载后网络恢复时继续下载
 * @param cloudFileId 云端PDF文件ID
 * @param existingPaths 已下载的图片路径
 * @param totalPageCount PDF总页数
 * @param fileId 文件唯一标识
 * @param onProgress 进度回调函数（包含当前已下载的路径数组）
 * @returns 更新后的图片路径数组、页数
 */
export async function continuePdfConversion(
  cloudFileId: string,
  existingPaths: string[],
  totalPageCount: number,
  _fileId: string,
  onProgress?: (progress: { current: number; total: number; paths: string[] }) => void
): Promise<{ paths: string[]; pageCount: number; isComplete: boolean }> {
  console.log(`继续加载PDF，已下载 ${existingPaths.length}/${totalPageCount} 页...`);

  // 获取临时URL用于下载预览图片
  const tempFileURL = await new Promise<string>((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [cloudFileId],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          reject(new Error('获取临时URL失败'));
        }
      },
      fail: reject
    });
  });

  const imagePaths = [...existingPaths]; // 复制已有的图片
  const startIndex = existingPaths.length + 1; // API 页码从1开始，跳过已下载的页面

  for (let i = startIndex; i <= totalPageCount; i++) {
    const imageParams = encodeURIComponent('imageMogr2/thumbnail/!200p|imageMogr2/format/webp|imageMogr2/quality/90');
    const previewUrl = `${tempFileURL}&ci-process=doc-preview&dstType=png&page=${i}&ImageParams=${imageParams}`;

    try {
      const localImagePath = await downloadImage(previewUrl);
      imagePaths.push(localImagePath);
      console.log(`下载第${i}/${totalPageCount}页成功`, previewUrl);

      // 调用进度回调，传入当前已下载的路径数组
      if (onProgress) {
        onProgress({ current: i, total: totalPageCount, paths: imagePaths });
      }
    } catch (err) {
      console.error(`下载第${i}页失败:`, err);
      // 继续尝试下载下一页
    }
  }

  const isComplete = imagePaths.length === totalPageCount;
  return { paths: imagePaths, pageCount: imagePaths.length, isComplete };
}

/**
 * 主函数：转换PDF为图片
 * @param localPath PDF本地路径
 * @param fileId 文件唯一标识
 * @param onProgress 进度回调函数（包含当前已下载的路径数组）
 * @returns 本地图片路径数组、页数、云文件ID
 */
export async function convertPdfToImages(
  localPath: string,
  fileId: string,
  onProgress?: (progress: { current: number; total: number; paths: string[] }) => void
): Promise<{ paths: string[]; pageCount: number; totalPageCount: number; cloudFileId: string; isPartialSuccess: boolean }> {
  // 1. 上传PDF到云存储
  console.log('开始上传PDF...');
  const fileID = await uploadPdfToCloud(localPath, fileId);


  // 2. 获取PDF页数
  console.log('检测PDF页数...');
  const pageCount = await getPdfPageCount(fileID);

  if (pageCount === 0) {
    throw new Error('PDF页数为0，无法转换');
  }

  // 3. 获取临时URL用于下载预览图片
  const tempFileURL = await new Promise<string>((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          reject(new Error('获取临时URL失败'));
        }
      },
      fail: reject
    });
  });

  // 4. 生成各页图片URL并下载
  console.log(`开始下载${pageCount}页图片...`, tempFileURL);
  const imagePaths: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const imageParams = encodeURIComponent('imageMogr2/thumbnail/!200p|imageMogr2/format/webp|imageMogr2/quality/90');
    const previewUrl = `${tempFileURL}&ci-process=doc-preview&dstType=png&page=${i}&ImageParams=${imageParams}`;

    try {
      const localImagePath = await downloadImage(previewUrl);
      imagePaths.push(localImagePath);
      console.log(`下载第${i}/${pageCount}页成功`, previewUrl);

      // 调用进度回调，传入当前已下载的路径数组
      if (onProgress) {
        onProgress({ current: i, total: pageCount, paths: imagePaths });
      }
    } catch (err) {
      console.error(`下载第${i}页失败:`, err);
      // 继续尝试下载下一页
    }
  }

  if (imagePaths.length === 0) {
    throw new Error('所有页面转换失败');
  }

  // 返回实际下载成功的数量，以及是否为部分成功
  const isPartialSuccess = imagePaths.length < pageCount;
  return {
    paths: imagePaths,
    pageCount: imagePaths.length, // 实际下载成功的页数
    totalPageCount: pageCount,    // PDF 真实总页数
    cloudFileId: fileID,
    isPartialSuccess
  };
}

/**
 * 显示加载提示
 */
export function showLoading(title: string = '处理中...') {
  wx.showLoading({
    title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
export function hideLoading() {
  wx.hideLoading();
}