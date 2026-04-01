/**
 * PDF转换工具
 * 使用微信云开发 + 腾讯云数据万象服务
 */

const CLOUD_ENV = 'cloudbase-7gipudlhe7a11395';

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
 * @param page 页码（从0开始）
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
 * 检查图片是否存在
 * @param url 图片URL
 * @returns 是否存在
 */
function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'HEAD',
      success: (res) => {
        console.log('res.header', res.header, JSON.stringify(res.header))
        resolve(res.statusCode === 200);
      },
      fail: () => {
        resolve(false);
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
              reject(new Error('保存图片失败'));
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
 * 主函数：转换PDF为图片
 * @param localPath PDF本地路径
 * @param fileId 文件唯一标识
 * @param onProgress 进度回调函数
 * @returns 本地图片路径数组、页数、云文件ID
 */
export async function convertPdfToImages(
  localPath: string,
  fileId: string,
  onProgress?: (progress: { current: number; total: number }) => void
): Promise<{ paths: string[]; pageCount: number; cloudFileId: string }> {
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

  for (let i = 0; i < pageCount; i++) {
    const previewUrl = `${tempFileURL}&ci-process=doc-preview&dstType=jpg&page=${i}`;

    try {
      const localImagePath = await downloadImage(previewUrl);
      imagePaths.push(localImagePath);
      console.log(`下载第${i + 1}/${pageCount}页成功`, previewUrl);

      // 调用进度回调
      if (onProgress) {
        onProgress({ current: i + 1, total: pageCount });
      }
    } catch (err) {
      console.error(`下载第${i + 1}页失败:`, err);
      // 继续尝试下载下一页
    }
  }

  if (imagePaths.length === 0) {
    throw new Error('所有页面转换失败');
  }

  return { paths: imagePaths, pageCount, cloudFileId: fileID };
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