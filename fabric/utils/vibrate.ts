/**
 * 振动相关工具函数
 */

// 振动类型
export type VibrateType = 'light' | 'medium' | 'heavy';

// 振动配置
const VIBRATE_CONFIG = {
  light: { type: 'light' },
  medium: { type: 'medium' },
  heavy: { type: 'heavy' }
};

/**
 * 执行振动
 * @param type 振动类型，可选 'light' | 'medium' | 'heavy'
 * @returns Promise
 */
export const vibrate = (type: VibrateType = 'medium'): Promise<void> => {
  return new Promise((resolve, reject) => {
    wx.vibrateShort({
      ...VIBRATE_CONFIG[type],
      success: () => resolve,
      fail: reject
    });
  });
};

/**
 * 执行长振动
 * @returns Promise
 */
export const vibrateLong = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    wx.vibrateLong({
      success: () => resolve,
      fail: reject
    });
  });
};
