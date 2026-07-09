/**
 * ofdts 核心模块
 *
 * 提供 OFD（GB/T 33190-2016 开放式文档格式）的解析与渲染公共 API。
 * 支持从 ArrayBuffer、File 对象或 URL 解析 OFD 文档，并将其渲染为 HTML DOM 元素。
 *
 * ## 解析 API
 *
 * | 函数 | 说明 |
 * |------|------|
 * | `parseOfdDocument(options)` | 解析 OFD 文档，输入支持 URL / File / ArrayBuffer |
 * | `setPageScale(scale)` | 设置全局页面缩放倍数 |
 * | `getPageScale()` | 获取当前全局页面缩放倍数 |
 *
 * ## 渲染 API
 *
 * | 函数 | 说明 |
 * |------|------|
 * | `renderOfd(screenWidth, ofd)` | 按指定屏幕宽度（像素）渲染所有页面 |
 * | `renderOfdByScale(ofd)` | 使用预配置的全局缩放渲染所有页面 |
 *
 * ## 类型导出
 *
 * | 类型 | 说明 |
 * |------|------|
 * | `OFDDocument` | 解析后的完整文档对象 |
 * | `Page` | 页面映射对象 `{pageId: PageContent}` |
 * | `PageContent` | 页面解析内容（JSON/XML/签章/注释） |
 * | `PageBox` | 页面尺寸（宽、高，像素） |
 * | `DocumentInfo` | 文档元信息 |
 * | `ParseOptions` | 解析选项（ofd 源 + 回调） |
 * | `FontResObj` | 字体资源映射 |
 * | `DrawParamResObj` | 绘制参数资源映射 |
 * | `MultiMediaResObj` | 多媒体资源映射 |
 *
 * 参照标准：GB/T 33190-2016
 */

// 浏览器兼容性 polyfill：为 bundled 依赖（immediate/setimmediate）提供 global 对象
// 这些依赖在 bun build 内联后直接引用 global，而浏览器中没有 global 变量。
// 注：Vite dev 模式通过 esbuild 预构建自动处理此问题，无需此 polyfill。
if (typeof window !== 'undefined' && typeof global === 'undefined') {
  (window as Window & typeof globalThis).global = window;
}

import { calPageBox, calPageBoxScale, renderPage } from "./ofd_render";
import { parseOfdSteps } from "./ofd_parser";
export { setPageScale, getPageScale } from "./utils/ofd_util";

// ---------------------------------------------------------------------------
// 公共类型定义
// ---------------------------------------------------------------------------

/**
 * 页面尺寸信息
 */
export interface PageBox {
  /** 页面宽度（像素） */
  w: number;
  /** 页面高度（像素） */
  h: number;
}

/** 页面解析内容 */
export interface PageContent {
  json: any;
  xml: string;
  stamp?: any[];
  annotation?: any[];
}

/**
 * 页面对象
 */
export interface Page {
  [pageId: string]: PageContent;
}

/** 字体资源映射 {fontID: fontName} */
export type FontResObj = Record<string, string>;

/** 绘制参数资源映射 */
export type DrawParamResObj = Record<string, any>;

/** 多媒体资源映射 */
export type MultiMediaResObj = Record<string, any>;

/**
 * 文档对象
 */
export interface OFDDocument {
  /** 文档 ID */
  doc: string;
  /** 页面数组 */
  pages: Page[];
  /** 文档主结构（XML JSON） */
  document: any;
  /** 模板资源 */
  tpls: Record<string, any>;
  /** 字体资源对象 */
  fontResObj: FontResObj;
  /** 绘制参数资源对象 */
  drawParamResObj: DrawParamResObj;
  /** 多媒体资源对象 */
  multiMediaResObj: MultiMediaResObj;
  /** 签章注释 */
  stampAnnot: Record<string, any[]>;
}

/**
 * 文档信息
 */
export interface DocumentInfo {
  [key: string]: any;
}

/**
 * 解析选项
 * @template OfdType - ofd 字段的类型
 */
export interface ParseOptions<OfdType = string | File | ArrayBuffer> {
  /**
   * OFD文件源
   * - 文件路径 (字符串)
   * - File 对象 (浏览器)
   * - ArrayBuffer (二进制数据)
   */
  ofd: OfdType;

  /** 成功回调函数 */
  success?: (document: OFDDocument[]) => void;

  /** 失败回调函数 */
  fail?: (error: Error) => void;
}

/**
 * 内部解析选项 - 用于已经转换为二进制的输入
 */
type DoParseOptions = ParseOptions<File | ArrayBuffer>;

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 解析 OFD 文档
 *
 * 支持三种输入方式：
 * 1. File 对象（浏览器文件选择）
 * 2. ArrayBuffer（已加载的二进制数据）
 * 3. URL 字符串（网络路径）
 *
 * @param options - 配置对象
 * @param options.ofd - OFD 文件（File/ArrayBuffer/URL字符串）
 * @param options.success - 解析成功回调
 * @param options.fail - 解析失败回调
 *
 * @example
 * // 从 URL 加载
 * parseOfdDocument({
 *   ofd: '/path/to/file.ofd',
 *   success: (doc: OFDDocument[]) => { renderOfd(800, doc); },
 *   fail: (err: Error) => { console.error(err); }
 * });
 */
export function parseOfdDocument(options: ParseOptions): void {
  function doParseOFD(opts: DoParseOptions): void {
    parseOfdSteps(opts.ofd)
      .then(data => { if (opts.success) opts.success(data); })
      .catch(err => { console.log(err); if (opts.fail) opts.fail(err); });
  }

  if (options.ofd instanceof File || options.ofd instanceof ArrayBuffer) {
    doParseOFD(options as DoParseOptions);
  } else {
    // Use native fetch instead of jszip-utils
    fetch(options.ofd)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(data => {
        options.ofd = data;
        doParseOFD(options as DoParseOptions);
      })
      .catch(err => {
        if (options.fail) options.fail(err);
        else console.error(err);
      });
  }
}

/**
 * 按指定屏幕宽度渲染 OFD 文档
 *
 * @param screenWidth - 渲染宽度（像素）
 * @param ofd - 解析后的 OFD 文档对象
 * @returns DIV 元素数组，每个元素对应一个页面
 */
export function renderOfd(screenWidth: number, ofd: OFDDocument): HTMLElement[] {
  let divArray: HTMLElement[] = [];
  if (!ofd) return divArray;
  for (const page of ofd.pages) {
    let box = calPageBox(screenWidth, ofd.document, page);
    const pageId = Object.keys(page)[0];
    let pageDiv = document.createElement('div');
    pageDiv.id = pageId;
    pageDiv.setAttribute('style',
      `margin-bottom: 20px;position: relative;width:${box.w}px;height:${box.h}px;background: white;`);
    renderPage(pageDiv, page, ofd.tpls, ofd.fontResObj, ofd.drawParamResObj, ofd.multiMediaResObj);
    divArray.push(pageDiv);
  }
  return divArray;
}

/**
 * 使用预配置的全局缩放渲染 OFD 文档
 *
 * @param ofd - 解析后的 OFD 文档对象
 * @returns DIV 元素数组，每个元素对应一个页面
 */
export function renderOfdByScale(ofd: OFDDocument): HTMLElement[] {
  let divArray: HTMLElement[] = [];
  if (!ofd) return divArray;
  for (const page of ofd.pages) {
    let box = calPageBoxScale(ofd.document, page);
    const pageId = Object.keys(page)[0];
    let pageDiv = document.createElement('div');
    pageDiv.id = pageId;
    pageDiv.setAttribute('style',
      `margin-bottom: 20px;position: relative;width:${box.w}px;height:${box.h}px;background: white;`);
    renderPage(pageDiv, page, ofd.tpls, ofd.fontResObj, ofd.drawParamResObj, ofd.multiMediaResObj);
    divArray.push(pageDiv);
  }
  return divArray;
}



export { calPageBox, calPageBoxScale, renderPage };
