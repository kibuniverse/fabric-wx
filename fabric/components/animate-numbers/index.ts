const CONFIG = {
  during: 1,        // :number 动画时间
  height: 40,       // :number 滚动行高 px
  cellWidth: 24,    // 单个数字宽度
  ease: 'cubic-bezier(0, 1, 0, 1)',   // 动画过渡效果
  color: '#FF5837', // 字体颜色
  columnStyle: '',  // 字体单元 覆盖样式
}

Component({

  properties: {
    value: {
      type: Number,
      observer(n) {
        this.run(n)
      }
    },
    max: {
      type: Number,
      value: 100,
      observer() {
        this.setRange()
      }
    },
    min: {
      type: Number,
      value: 0,
      observer() {
        this.setRange()
      }
    },
    options: {
      type: Object,
      value: {}
    },

  },
  data: {
    columns: [] as string[][],
    keys: [] as number[],
    _options: JSON.parse(JSON.stringify(CONFIG)),
  },

  attached() {
    this.setRange()
    this.renderStyle()
    
    // 确保初始渲染时使用的是当前值的列数
    if (this.properties.value !== undefined) {
      this.run(this.properties.value)
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    setRange() {
      let { max, min, value } = this.properties

      min = min >= 0 ? min : 0
      max = max > min ? max : min
      
      // 优先使用当前值初始化列，确保宽度正确
      let columns;
      if (value !== undefined) {
        columns = this.initColumn(value);
      } else {
        columns = this.initColumn(max);
      }

      this.setData({
        columns,
        max,
        min,
      })

      // 范围调整后，修正当前 value
      if (this.properties.value) {
        this.run(this.properties.value)
      }

    },
    initColumn(n: number) {
      let digit = (n + '').length,
        arr = [],
        rows = [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      
      // 如果是个位数，只需要一列
      if (digit === 1) {
        arr.push(rows.slice(1));
        return arr;
      }
      
      // 多位数的情况，从右向左构建每一列
      for (let i = 0; i < digit; i++) {
        if (i) {
          arr.unshift(rows)
        } else {
          arr.unshift(rows.slice(1))
        }
      }
      return arr
    },

    run(n: number) {
      let { max, min } = this.data;
      let value = n;
      value = value < min ? min :
        value > max ? max : value;
      let valueArr = value.toString().split(''),
        lengths = this.data.columns.length,
        indexs = [];
      
      // 处理数字位数与列数不匹配的情况
      if (value.toString().length !== lengths) {
        // 重新初始化列
        const columns = this.initColumn(value);
        this.setData({ columns });
        lengths = columns.length;
        
        // 确保重新渲染样式，适应新的列数
        setTimeout(() => {
          this.renderStyle();
        }, 0);
      }

      while (valueArr.length) {
        let figure = valueArr.pop();
        if (indexs.length) {
          indexs.unshift(parseInt(figure!) + 1)
        } else {
          indexs.unshift(parseInt(figure!))
        }
      }
      
      // 对于多位数，填充左侧空位
      while (indexs.length < lengths) {
        indexs.unshift(0)
      }
      
      this.setData({
        keys: indexs
      })
    },
    renderStyle() {
      /**
       * color,
       * columnStyle, 
       * cellWidth, 
       * height, 
       * during, 
       * ease, 
       */
      let options = this.properties.options,
        _options = this.data._options;
      Object.keys(options).map(i => {
        let val = options[i]
        switch (i) {
          case 'during':
          case 'height':
          case 'cellWidth':
            if (parseInt(val) || val === 0 || val === '0') {
              _options[i] = val
            }
            break;
          default:
            val && (_options[i] = val);
            break;
        }

      })
      this.setData({
        _options
      })
    },
  }
})

