/**
 * OFD 工具函数
 *
 * 提供 OFD 文档解析和渲染所需的坐标转换、颜色解析、字体映射、
 * 路径数据处理等通用工具函数。
 *
 * 参照标准：GB/T 33190-2016《电子文件 存储与交换格式 第1部分：OFD》
 * - 第 7.2 节：坐标系统（毫米单位）
 * - 第 7.3 节：区域定义（PhysicalBox/ApplicationBox/ContentBox）
 * - 第 7.4 节：图形对象（路径/文本/图像）
 */

/**
 * 页面盒子的边界接口，符合 OFD 标准中 ST_Box 类型定义
 * GB/T 33190-2016 第 7.2 节
 */
export interface ST_Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 路径点接口，表示 OFD 路径对象中的一个点
 * GB/T 33190-2016 第 7.4.3 节
 */
export interface PathPoint {
  type: 'M' | 'L' | 'C' | 'Q' | 'B';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x3?: number;
  y3?: number;
}

/**
 * 将 OFD AbbreviatedData 路径缩写数据转换为点列表
 * GB/T 33190-2016 第 7.4.3 节 路径对象
 *
 * OFD 路径缩写格式说明（支持指令）：
 * - M (MoveTo): M x y - 移动当前点到指定位置
 * - S (Same As MoveTo): S x y - 同 M
 * - L (LineTo): L x y - 画直线到指定位置
 * - Q (Quadratic Bezier): Q x1 y1 x2 y2 - 二次贝塞尔曲线
 * - B (Cubic Bezier): B x1 y1 x2 y2 x3 y3 - 三次贝塞尔曲线（注意：标准中为C，此处为与PDF.js区分）
 * - C (ClosePath): C - 闭合当前路径
 *
 * @param abbreviatedData - OFD 路径缩写字符串
 * @returns 路径点列表
 */
export function convertPathAbbreviatedDatatoPoint(abbreviatedData: string): PathPoint[] {
  let array = abbreviatedData.split(' ');
  let pointList: PathPoint[] = [];
  let i = 0;
  while (i < array.length) {
    if (array[i] === 'M' || array[i] === 'S') {
      let point: PathPoint = {
        'type': 'M',
        'x': parseFloat(array[i + 1]),
        'y': parseFloat(array[i + 2])
      };
      i = i + 3;
      pointList.push(point);
    } else if (array[i] === 'L') {
      let point: PathPoint = {
        'type': 'L',
        'x': parseFloat(array[i + 1]),
        'y': parseFloat(array[i + 2])
      };
      i = i + 3;
      pointList.push(point);
    } else if (array[i] === 'C') {
      // OFD 中 C 表示闭合路径 (ClosePath)
      let point: PathPoint = { 'type': 'C', x: 0, y: 0 };
      pointList.push(point);
      i++;
    } else if (array[i] === 'Q') {
      let point: PathPoint = {
        'type': 'Q',
        'x1': parseFloat(array[i + 1]),
        'y1': parseFloat(array[i + 2]),
        'x2': parseFloat(array[i + 3]),
        'y2': parseFloat(array[i + 4])
      };
      i = i + 5;
      pointList.push(point);
    } else if (array[i] === 'B') {
      let point: PathPoint = {
        'type': 'B',
        'x1': parseFloat(array[i + 1]),
        'y1': parseFloat(array[i + 2]),
        'x2': parseFloat(array[i + 3]),
        'y2': parseFloat(array[i + 4]),
        'x3': parseFloat(array[i + 5]),
        'y3': parseFloat(array[i + 6])
      };
      i = i + 7;
      pointList.push(point);
    } else {
      i++;
    }
  }
  return pointList;
}

/**
 * 对路径点进行 DPI 转换，将 OFD 坐标（毫米）转换为像素
 * @param abbreviatedPoint - 解析后的路径点列表
 * @returns 转换后的路径点列表
 */
export function calPathPoint(abbreviatedPoint: PathPoint[]): PathPoint[] {
  let pointList: PathPoint[] = [];

  for (let i = 0; i < abbreviatedPoint.length; i++) {
    let point = abbreviatedPoint[i];
    if (point.type === 'M' || point.type === 'L') {
      let x = point.x || 0, y = point.y || 0;
      point.x = converterDpi(x);
      point.y = converterDpi(y);
      pointList.push(point);
    } else if (point.type === 'C') {
      // 闭合路径不需要转换坐标
      pointList.push({ type: 'C', x: 0, y: 0 });
    } else if (point.type === 'Q') {
      let realPoint: PathPoint = {
        'type': 'Q',
        'x1': converterDpi(point.x1 || 0),
        'y1': converterDpi(point.y1 || 0),
        'x2': converterDpi(point.x2 || 0),
        'y2': converterDpi(point.y2 || 0)
      };
      pointList.push(realPoint);
    } else if (point.type === 'B') {
      let realPoint: PathPoint = {
        'type': 'B',
        'x1': converterDpi(point.x1 || 0),
        'y1': converterDpi(point.y1 || 0),
        'x2': converterDpi(point.x2 || 0),
        'y2': converterDpi(point.y2 || 0),
        'x3': converterDpi(point.x3 || 0),
        'y3': converterDpi(point.y3 || 0)
      };
      pointList.push(realPoint);
    }
  }
  return pointList;
}

/**
 * 毫米转像素
 * GB/T 33190-2016 定义 OFD 所有长度单位为毫米
 * @param mm - 毫米值
 * @param dpi - 每英寸点数
 * @returns 像素值
 */
function millimetersToPixel(mm: number, dpi: number): number {
  return ((mm * dpi / 25.4));
}

/** 最大缩放倍数 */
let MaxScale = 10;

/** 当前缩放倍数 */
let Scale = MaxScale;

/**
 * 设置最大页面缩放值
 * @param scale - 缩放值
 */
export function setMaxPageScal(scale: number): void {
  MaxScale = scale > 5 ? 5 : scale;
}

/**
 * 设置页面缩放值
 * @param scale - 缩放值
 */
export function setPageScal(scale: number): void {
  Scale = scale;
  Scale = Scale > MaxScale ? MaxScale : Scale;
}

/**
 * 获取当前页面缩放值
 * @returns 当前缩放倍数
 */
export function getPageScal(): number {
  return Scale;
}

/**
 * DPI 转换：将 OFD 坐标单位（毫米）转换为像素
 * OFD 标准使用毫米作为基本长度单位（第 7.2 节）
 * @param width - 毫米值
 * @returns 像素值
 */
export function converterDpi(width: number): number {
  return millimetersToPixel(width, Scale * 25.4);
}

/**
 * Delta 偏移量格式化解码
 * 支持 OFD 文本编码中的重复标识 g N
 * g N 表示后续一个值重复 N 次，用于节省空间
 * @param delta - Delta 字符串
 * @returns 浮点数列表
 */
export function deltaFormatter(delta: string): number[] {
  if (delta.indexOf("g") === -1) {
    let floatList: number[] = [];
    for (let f of delta.split(' ')) {
      floatList.push(parseFloat(f));
    }
    return floatList;
  } else {
    const array = delta.split(' ');
    let gFlag = false;
    let gProcessing = false;
    let gItemCount = 0;
    let floatList: number[] = [];
    for (const s of array) {
      if ('g' === s) {
        gFlag = true;
      } else {
        if (!s || s.trim().length == 0) {
          continue;
        }
        if (gFlag) {
          gItemCount = parseInt(s);
          gProcessing = true;
          gFlag = false;
        } else if (gProcessing) {
          for (let j = 0; j < gItemCount; j++) {
            floatList.push(parseFloat(s));
          }
          gProcessing = false;
        } else {
          floatList.push(parseFloat(s));
        }
      }
    }
    return floatList;
  }
}

/**
 * 计算文本位置点
 * 解析 TextCode 中的 X/Y 位置和 DeltaX/DeltaY 偏移
 * GB/T 33190-2016 第 7.4.4 节 文本对象
 *
 * TextCode 包含：
 * - @_X: 起始 X 坐标（毫米）
 * - @_Y: 起始 Y 坐标（毫米）
 * - @_DeltaX: 每个字符后的 X 偏移量列表
 * - @_DeltaY: 每个字符后的 Y 偏移量列表
 * - #text: 文本内容
 *
 * @param textCodes - TextCode 对象数组
 * @returns 文本位置点列表
 */
export function calTextPoint(textCodes: any[]): Array<{ x: number; y: number; text: string }> {
  let x = 0;
  let y = 0;
  let textCodePointList: Array<{ x: number; y: number; text: string }> = [];
  if (!textCodes) {
    return textCodePointList;
  }
  for (let textCode of textCodes) {
    if (!textCode) {
      continue;
    }
    x = parseFloat(textCode['@_X']);
    y = parseFloat(textCode['@_Y']);

    if (isNaN(x)) {
      x = 0;
    }
    if (isNaN(y)) {
      y = 0;
    }

    let deltaXList: number[] = [];
    let deltaYList: number[] = [];
    if (textCode['@_DeltaX'] && textCode['@_DeltaX'].length > 0) {
      deltaXList = deltaFormatter(textCode['@_DeltaX']);
    }
    if (textCode['@_DeltaY'] && textCode['@_DeltaY'].length > 0) {
      deltaYList = deltaFormatter(textCode['@_DeltaY']);
    }
    let textStr = textCode['#text'];
    if (textStr) {
      textStr += '';
      textStr = decodeHtml(textStr);
      textStr = textStr.replace(/&#x20;/g, ' ');
      const hasPositionDelta = deltaXList.length > 0 || deltaYList.length > 0;
      for (let i = 0; i < textStr.length; i++) {
        if (i > 0 && deltaXList.length > 0) {
          x += deltaXList[(i - 1)] || 0;
        }
        if (i > 0 && deltaYList.length > 0) {
          y += deltaYList[(i - 1)] || 0;
        }
        let text = textStr.substring(i, i + 1);
        const pointX = converterDpi(x);
        const pointY = converterDpi(y);
        if (!hasPositionDelta) {
          let filterPoint = textCodePointList.find((textCodePoint) => {
            return textCodePoint.y == pointY && textCodePoint.x == pointX;
          });
          if (filterPoint) {
            filterPoint.text += text;
            continue;
          }
        }
        let textCodePoint = { x: pointX, y: pointY, text: text };
        textCodePointList.push(textCodePoint);
      }
    }
  }
  return textCodePointList;
}

/**
 * 移除字符串开头的斜杠
 * OFD 文件路径可能以 '/' 开头，需要规范化
 * @param str - 输入字符串
 * @returns 处理后的字符串
 */
export function replaceFirstSlash(str: string): string {
  if (str) {
    if (str.indexOf('/') === 0) {
      str = str.replace('/', '');
    }
  }
  return str;
}

/**
 * 根据文件路径获取扩展名
 * @param path - 文件路径
 * @returns 小写扩展名
 */
export function getExtensionByPath(path: string): string {
  if (!path || typeof path !== "string") return "";
  return path.substring(path.lastIndexOf('.') + 1);
}

/** HTML 实体解码正则 */
const REGX_HTML_DECODE = /&\w+;|&#(\d+);|&#x([\da-fA-F]+);/g;

/** HTML 实体映射表 */
const HTML_DECODE: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": "\"",
  "&copy;": "",
  "&apos;": "'",
};

/**
 * HTML 实体解码
 * @param s - 包含 HTML 实体的字符串
 * @returns 解码后的字符串
 */
export function decodeHtml(s: string): string {
  s = (s != undefined) ? s : '';
  return (typeof s != "string") ? s :
    s.replace(REGX_HTML_DECODE,
      function ($0: string, $1: string, $2: string) {
        var c = HTML_DECODE[$0];
        if (c == undefined) {
          if ($2) {
            c = String.fromCharCode(parseInt($2, 16));
          } else if (!isNaN(Number($1))) {
            c = String.fromCharCode((Number($1) == 160) ? 32 : Number($1));
          } else {
            c = $0;
          }
        }
        return c;
      });
}

/**
 * OFD 字体名称到 Web 字体的映射表
 * OFD 文档中的字体名称（如"楷体"、"宋体"、"黑体"等）需要映射到
 * Web 浏览器可识别的字体名称
 */
const FONT_FAMILY: Record<string, string> = {
  '楷体': '楷体, KaiTi, Kai, simkai',
  'kaiti': '楷体, KaiTi, Kai, simkai',
  'Kai': '楷体, KaiTi, Kai',
  'simsun': 'SimSun, simsun, Songti SC',
  '宋体': 'SimSun, simsun, Songti SC',
  '黑体': 'SimHei, STHeiti, simhei',
  '仿宋': 'FangSong, STFangsong, simfang',
  '小标宋体': 'sSun',
  '方正小标宋_gbk': 'sSun',
  '仿宋_gb2312': 'FangSong, STFangsong, simfang',
  '楷体_gb2312': '楷体, KaiTi, Kai, simkai',
  'couriernew': 'Courier New',
  'courier new': 'Courier New',
};

/**
 * 根据 OFD 字体名称获取 Web 安全字体系列
 * @param font - OFD 字体名称
 * @returns CSS 字体系列字符串
 */
export function getFontFamily(font: string): string {
  if (!font) {
    return 'Arial, SimSun, simsun, Songti SC, sans-serif';
  }
  if (FONT_FAMILY[font.toLowerCase()]) {
    font = FONT_FAMILY[font.toLowerCase()];
  }
  for (let key of Object.keys(FONT_FAMILY)) {
    if (font.toLowerCase().indexOf(key.toLowerCase()) != -1) {
      return FONT_FAMILY[key];
    }
  }
  return `${font}, Arial, SimSun, simsun, Songti SC, sans-serif`;
}

/**
 * 解析 OFD Box 字符串为结构体
 * OFD 标准中 Box 格式为 "x y w h" 四值空格分隔
 * GB/T 33190-2016 第 7.2 节
 * @param obj - Box 字符串
 * @returns ST_Box 结构
 */
export function parseStBox(obj: string): ST_Box | null {
  if (obj) {
    let array = obj.split(' ');
    return {
      x: parseFloat(array[0]), y: parseFloat(array[1]),
      w: parseFloat(array[2]), h: parseFloat(array[3])
    };
  } else {
    return null;
  }
}

/**
 * 解析 CTM 变换矩阵字符串
 * CTM 格式为 "a b c d e f" 六个值
 * 对应矩阵 [ a c e ]
 *          [ b d f ]
 *          [ 0 0 1 ]
 * GB/T 33190-2016 第 7.2.3 节
 * @param ctm - CTM 字符串
 * @returns 六个值的数组
 */
export function parseCtm(ctm: string): string[] {
  let array = ctm.split(' ');
  return array;
}

/**
 * 颜色值解析，支持：
 * - 十六进制格式 #RRGGBB
 * - RGB 三通道格式 "R G B"
 * @param color - 颜色字符串
 * @returns CSS 颜色值
 */
export function parseColor(color: string): string {
  if (color) {
    if (color.indexOf('#') !== -1) {
      color = color.replace(/#/g, '');
      color = color.replace(/ /g, '');
      color = '#' + color.toString();
      return color;
    }
    let array = color.split(' ');
    return `rgb(${array[0]}, ${array[1]}, ${array[2]})`;
  } else {
    return `rgb(0, 0, 0)`;
  }
}

/**
 * 将 OFD 坐标框转换为像素坐标框
 * @param box - 原始 Box 结构（毫米单位）
 * @returns 转换后的 Box 结构（像素单位）
 */
export function converterBox(box: ST_Box): ST_Box {
  return {
    x: converterDpi(box.x), y: converterDpi(box.y),
    w: converterDpi(box.w), h: converterDpi(box.h)
  };
}

/**
 * Uint8Array 转十六进制字符串
 * 用于密码学操作，如摘要值比较
 * @param arr - 字节数组
 * @returns 十六进制字符串
 */
export function Uint8ArrayToHexString(arr: Uint8Array): string {
  let hexChars: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    hexChars.push((arr[i] >>> 4).toString(16));
    hexChars.push((arr[i] & 0x0f).toString(16));
  }
  return hexChars.join('');
}
