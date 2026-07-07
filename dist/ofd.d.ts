/**
 * OFD.js 主入口
 *
 * 提供 OFD 文档解析和渲染的公共 API。
 * 支持解析 OFD 文件（ArrayBuffer/File/URL）并渲染为 DOM 元素。
 *
 * 主要导出：
 * - parseOfdDocument() - 解析 OFD 文档
 * - renderOfd() - 按指定宽度渲染文档
 * - renderOfdByScale() - 使用配置的缩放渲染文档
 * - setPageScale() / getPageScale() - 缩放控制
 *
 * 参照标准：GB/T 33190-2016
 * Modify by Ycsx on 2026-06-25
 * - 修改导出使其符合 eslint 规范
 * - 依赖版本升级
 * - Template 模式使用作者原方式展示
 * - PathContent 模式使用新增 Canvas 方式展示
 */
/**
 * 页面尺寸信息
 */
export interface PageBox {
    /** 页面宽度（像素） */
    w: number;
    /** 页面高度（像素） */
    h: number;
}
/**
 * 页面对象
 */
export interface Page {
    [pageId: string]: any;
}
/**
 * 文档对象
 */
export interface OFDDocument {
    /** 页面数组 */
    pages: Page[];
    /** 文档信息 */
    document: DocumentInfo;
    /** 模板资源 */
    tpls: any;
    /** 字体资源对象 */
    fontResObj: Record<string, any>;
    /** 绘制参数资源对象 */
    drawParamResObj: Record<string, any>;
    /** 多媒体资源对象 */
    multiMediaResObj: Record<string, any>;
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
export declare function parseOfdDocument(options: ParseOptions): void;
/**
 * 按指定屏幕宽度渲染 OFD 文档
 *
 * @param screenWidth - 渲染宽度（像素）
 * @param ofd - 解析后的 OFD 文档对象
 * @returns DIV 元素数组，每个元素对应一个页面
 */
export declare const renderOfd: (screenWidth: number, ofd: OFDDocument) => HTMLElement[];
/**
 * 使用预配置的全局缩放渲染 OFD 文档
 *
 * @param ofd - 解析后的 OFD 文档对象
 * @returns DIV 元素数组，每个元素对应一个页面
 */
export declare const renderOfdByScale: (ofd: OFDDocument) => HTMLElement[];
/**
 * 设置页面缩放值
 * @param scale - 缩放倍数
 */
export declare const setPageScale: (scale: number) => void;
/**
 * 获取当前页面缩放值
 * @returns 当前缩放倍数
 */
export declare const getPageScale: () => number;
export { };
