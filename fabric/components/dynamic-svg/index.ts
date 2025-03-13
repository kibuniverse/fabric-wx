/**
 * 小程序的svg动态化方案，支持简单的颜色替换。
 * 需要注意的是类名通过 **svg-class="class-name"** 方式传入，svg的文件路径通过svgPath传入。
 *
 * 该组件主要解决的是一些相似svg的复用问题，比如：箭头、logo、物品使用状态图戳等。以尽可能极减少了svg的数量，提高了小程序的加载速度。
 * @example <dynamic-svg svg-class="right-icon" svgPath="/svgs/right-icon.svg" color="#999999" mode="XXX"/>'
 */

import { base64 } from '../../utils/base64';

Component({
  options: {
    virtualHost: true,
  },
  externalClasses: ['svg-class'],
  properties: {
    /** 图标路径 */
    svgPath: {
      type: String,
      value: '',
    },
    /** 图标颜色 */
    color: {
      type: String,
      value: '',
    },
    /** 图片裁剪、缩放的模式 */
    mode: {
      type: String,
      value: 'aspectFit',
    },
  },
  observers: {
    // 监听名称和颜色变化
    'svgPath,color'(svgPath, color) {
      this.changeIcon(svgPath, color);
    },
  },
  data: {
    svgData: '',
  },

  methods: {
    changeIcon(svgPath: string, color?: string) {
      // 不传入颜色时，直接采用原图进行展示
      if (!color) {
        return this.setData({
          svgData: svgPath,
        });
      }

      try {
        const self = this;
        // 读取本地SVG文件内容
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: svgPath,
          encoding: 'utf-8',
          success(res: WechatMiniprogram.ReadFileSuccessCallbackResult) {
            const svgContent = res.data as string; // 读取到svg文件的内容
            // 替换颜色
            const newSvgContent = /(fill|stroke)=".*?"/.test(svgContent)
              ? svgContent.replace(/(fill|stroke)=".*?"/g, `$1="${color}"`) // SVG有默认色，注意结尾跟一个空格
              : svgContent.replace(/<svg /, `<svg fill="${color}" `); // 无默认色，注意结尾跟一个空格

            self.setData({
              svgData: `data:image/svg+xml;base64,${base64.encode(newSvgContent as string)}`, // 渲染
            });
          },
        });
      } catch (error) {
        // TODO:根据自己的业务补充相关的告警策略
        this.setData({
          svgData: svgPath, // 采用基本原图进行兜底处理
        });
      }
    },
  },
});