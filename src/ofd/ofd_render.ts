/**
 * OFD 页面渲染器
 *
 * 将解析后的 OFD 文档渲染到 DOM 中，支持：
 * - Canvas 渲染：用于路径对象（矢量图形）
 * - SVG 渲染：用于文本对象
 * - DOM 渲染：用于图像对象
 *
 * 渲染流程：
 * 1. 计算页面区域（PhysicalBox/ApplicationBox）
 * 2. 渲染模板页图层
 * 3. 渲染内容页图层（按 ZOrder 顺序）
 * 4. 渲染电子签章图层
 *
 * 参照标准：GB/T 33190-2016
 * - 第 7.2 节：坐标系统与页面区域
 * - 第 7.4 节：图形对象（ImageObject/PathObject/TextObject）
 * - 第 8.3 节：电子签名
 */

import {
  calPathPoint,
  calTextPoint,
  converterDpi,
  convertPathAbbreviatedDatatoPoint,
  getFontFamily,
  parseColor,
  parseCtm,
  parseStBox,
  setPageScal,
  converterBox,
  setMaxPageScal,
  ST_Box,
  PathPoint,
} from "./ofd_util";

/**
 * 计算页面盒子列表
 * @param screenWidth - 屏幕宽度（像素）
 * @param pages - 页面列表
 * @param document - 文档对象
 * @returns 页面盒子数组
 */
export const renderPageBox = function (screenWidth: number, pages: any[], document: any): Array<{ id: string; box: ST_Box }> {
  let pageBoxs: Array<{ id: string; box: ST_Box }> = [];
  for (const page of pages) {
    let boxObj = { id: Object.keys(page)[0], box: calPageBox(screenWidth, document, page) };
    pageBoxs.push(boxObj);
  }
  return pageBoxs;
};

/**
 * 从页面文档中提取最合适的区域定义
 * 优先顺序：PhysicalBox > ApplicationBox > ContentBox
 * GB/T 33190-2016 第 7.3 节：页面区域
 */
function getPageBox(page: any, document: any): string | null {
  const area = page[Object.keys(page)[0]]?.['json']?.['ofd:Area'];
  if (area) {
    return area['ofd:PhysicalBox'] || area['ofd:ApplicationBox'] || area['ofd:ContentBox'] || null;
  }
  let documentArea = document['ofd:CommonData']?.['ofd:PageArea'];
  if (documentArea) {
    return documentArea['ofd:PhysicalBox'] || documentArea['ofd:ApplicationBox'] || documentArea['ofd:ContentBox'] || null;
  }
  return null;
}

/**
 * 计算页面矩形区域
 * @param screenWidth - 屏幕宽度
 * @param document - 文档对象
 * @param page - 页面对象
 * @returns 转换后的 Box
 */
export const calPageBox = function (screenWidth: number, document: any, page: any): ST_Box {
  const boxStr = getPageBox(page, document);
  if (!boxStr) return { x: 0, y: 0, w: 0, h: 0 };
  let array = boxStr.split(' ');
  const scale = ((screenWidth - 10) / parseFloat(array[2])).toFixed(1);
  setMaxPageScal(parseFloat(scale));
  setPageScal(parseFloat(scale));
  let box = parseStBox(boxStr);
  if (!box) return { x: 0, y: 0, w: 0, h: 0 };
  return converterBox(box);
};

/**
 * 用现有缩放计算页面盒子
 * @param document - 文档对象
 * @param page - 页面对象
 * @returns 转换后的 Box
 */
export const calPageBoxScale = function (document: any, page: any): ST_Box {
  const boxStr = getPageBox(page, document);
  if (!boxStr) return { x: 0, y: 0, w: 0, h: 0 };
  let box = parseStBox(boxStr);
  if (!box) return { x: 0, y: 0, w: 0, h: 0 };
  return converterBox(box);
};

/**
 * 渲染映射页：根据模板 ID 渲染模板页上的所有图层
 * GB/T 33190-2016 第 10.2 节
 */
const renderLayerFromTemplate = function (
  tpls: Record<string, any>, template: any, pageDiv: HTMLElement,
  fontResObj: any, drawParamResObj: any, multiMediaResObj: any
): void {
  let layers: any[] = [].concat(tpls[template['@_TemplateID']]?.['json']?.['ofd:Content']?.['ofd:Layer'] || []);
  for (let layer of layers) {
    if (layer) {
      renderLayer(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, layer, false);
    }
  }
};

/**
 * 渲染单个页面到指定 DIV 元素
 * 渲染顺序：模板页 -> 内容页 -> 签章 -> 注释
 * @param pageDiv - 目标 DIV 元素
 * @param page - 页面对象
 * @param tpls - 模板页映射
 * @param fontResObj - 字体资源
 * @param drawParamResObj - 绘制参数
 * @param multiMediaResObj - 多媒体资源
 */
export const renderPage = function (
  pageDiv: HTMLElement, page: any, tpls: any,
  fontResObj: any, drawParamResObj: any, multiMediaResObj: any
): void {
  const pageId = Object.keys(page)[0];
  const template = page[pageId]?.['json']?.['ofd:Template'];

  // 渲染模板页
  if (Array.isArray(template)) {
    template.forEach(item => {
      if (item) {
        renderLayerFromTemplate(tpls, item, pageDiv, fontResObj, drawParamResObj, multiMediaResObj);
      }
    });
  } else if (template) {
    renderLayerFromTemplate(tpls, template, pageDiv, fontResObj, drawParamResObj, multiMediaResObj);
  }

  // 渲染内容页图层
  const contentLayers: any[] = [].concat(page[pageId]?.json?.['ofd:Content']?.['ofd:Layer'] || []);
  for (let contentLayer of contentLayers) {
    if (contentLayer) {
      renderLayer(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, contentLayer, false);
    }
  }

  // 渲染签章
  if (page[pageId].stamp) {
    for (const stamp of page[pageId].stamp) {
      if (stamp.type === 'ofd') {
        renderSealPage(pageDiv, stamp.obj.document, stamp.obj.pages, stamp.obj.tpls, true,
          stamp.stamp.stampAnnot, stamp.obj.fontResObj, stamp.obj.drawParamResObj,
          stamp.obj.multiMediaResObj, stamp.stamp.sealObj.SES_Signature, stamp.stamp.signedInfo);
      } else if (stamp.type === 'png') {
        let sealBoundary = converterBox(stamp.obj.boundary);
        const oid = Array.isArray(stamp.stamp.stampAnnot)
          ? stamp.stamp.stampAnnot[0]?.['pfIndex']
          : stamp.stamp.stampAnnot?.['pfIndex'];
        let element = renderImageOnDiv(
          pageDiv.style.width, pageDiv.style.height, stamp.obj.img,
          sealBoundary, stamp.obj.clip, true, stamp.stamp.sealObj.SES_Signature,
          stamp.stamp.signedInfo, oid);
        pageDiv.appendChild(element);
      }
    }
  }

  // 渲染注释
  if (page[pageId].annotation) {
    for (const annotation of page[pageId].annotation) {
      renderAnnotation(pageDiv, annotation, fontResObj, drawParamResObj, multiMediaResObj);
    }
  }
};

/**
 * 渲染注释
 * GB/T 33190-2016 第 9.2 节
 */
const renderAnnotation = function (
  pageDiv: HTMLElement, annotation: any,
  fontResObj: any, drawParamResObj: any, multiMediaResObj: any
): void {
  let div = document.createElement('div');
  let boundary = annotation['appearance']?.['@_Boundary'];
  if (boundary) {
    let divBoundary = converterBox(parseStBox(boundary)!);
    div.setAttribute('style',
      `overflow: hidden;z-index:${annotation['pfIndex']};position:absolute;
       left: ${divBoundary.x}px; top: ${divBoundary.y}px;
       width: ${divBoundary.w}px; height: ${divBoundary.h}px`);
  }
  const contentLayer = annotation['appearance'];
  renderLayer(div, fontResObj, drawParamResObj, multiMediaResObj, contentLayer, false);
  pageDiv.appendChild(div);
};

/**
 * 渲染签章页面
 */
const renderSealPage = function (
  pageDiv: HTMLElement, docObj: any, pages: any[], tpls: any,
  isStampAnnot: boolean, stampAnnot: any, fontResObj: any,
  drawParamResObj: any, multiMediaResObj: any, SES_Signature: any, signedInfo: any
): void {
  for (const page of pages) {
    const pageId = Object.keys(page)[0];
    let stampAnnotBoundary = isStampAnnot && stampAnnot
      ? stampAnnot.boundary : { x: 0, y: 0, w: 0, h: 0 };
    let divBoundary = converterBox(stampAnnotBoundary);
    const sealBox = calPageBoxScale(docObj, page);
    const scaleX = sealBox.w ? divBoundary.w / sealBox.w : 1;
    const scaleY = sealBox.h ? divBoundary.h / sealBox.h : 1;

    let div = document.createElement('div');
    div.setAttribute("name", "seal_img_div");
    div.setAttribute('style',
      `cursor: pointer; overflow:hidden; position:absolute;
       left: ${divBoundary.x}px; top: ${divBoundary.y}px;
       width: ${divBoundary.w}px; height: ${divBoundary.h}px`);
    div.setAttribute('data-ses-signature', JSON.stringify(SES_Signature));
    div.setAttribute('data-signed-info', JSON.stringify(signedInfo));

    const contentWrapper = document.createElement('div');
    contentWrapper.setAttribute('style',
      `position:absolute;left:0;top:0;width:${sealBox.w}px;height:${sealBox.h}px;
       transform:scale(${scaleX},${scaleY});transform-origin:0 0;`);

    const template = page[pageId]?.['json']?.['ofd:Template'];
    const templateArray: any[] = [].concat(template || []);
    for (const item of templateArray) {
      const tpl = item && tpls && tpls[item['@_TemplateID']];
      const layers: any[] = [].concat(tpl?.json?.['ofd:Content']?.['ofd:Layer'] || []);
      for (let layer of layers) {
        if (layer) renderLayer(contentWrapper, fontResObj, drawParamResObj, multiMediaResObj, layer, true);
      }
    }

    const contentLayers: any[] = [].concat(page[pageId]?.['json']?.['ofd:Content']?.['ofd:Layer'] || []);
    for (let contentLayer of contentLayers) {
      if (contentLayer) renderLayer(contentWrapper, fontResObj, drawParamResObj, multiMediaResObj, contentLayer, true);
    }
    div.appendChild(contentWrapper);
    pageDiv.appendChild(div);
  }
};

/**
 * 收集图层中指定类型的所有对象（递归遍历嵌套 PageBlock）
 * 支持无限嵌套的 PageBlock 结构
 */
const collectLayerObjects = function (layer: any, key: string): any[] {
  const objects: any[] = [];
  for (const item of [].concat(layer?.[key] || [])) {
    if (item) objects.push(item);
  }
  for (const pageBlock of [].concat(layer?.['ofd:PageBlock'] || [])) {
    for (const item of [].concat(pageBlock?.[key] || [])) {
      if (item) objects.push(item);
    }
    for (const nestedBlock of [].concat(pageBlock?.['ofd:PageBlock'] || [])) {
      objects.push(...collectLayerObjects(nestedBlock, key));
    }
  }
  return objects;
};

/**
 * 渲染单个图层
 * @param pageDiv - 父容器
 * @param fontResObj - 字体资源
 * @param drawParamResObj - 绘制参数
 * @param multiMediaResObj - 多媒体资源
 * @param layer - 图层对象
 * @param isStampAnnot - 是否是签署注释
 */
const renderLayer = function (
  pageDiv: HTMLElement, fontResObj: any, drawParamResObj: any,
  multiMediaResObj: any, layer: any, isStampAnnot: boolean
): void {
  let fillColor: string | null = null;
  let strokeColor: string | null = null;
  let lineWith = converterDpi(0.353);
  let fragment = document.createDocumentFragment();
  let drawParam = layer?.['@_DrawParam'] || layer?.['ofd:PageBlock']?.['@_DrawParam'];
  if (drawParam && drawParamResObj[drawParam]) {
    let dp = drawParamResObj[drawParam];
    if (dp['relative']) {
      drawParam = dp['relative'];
      const rdp = drawParamResObj[drawParam];
      if (rdp) {
        fillColor = rdp['FillColor'] ? parseColor(rdp['FillColor']) : fillColor;
        strokeColor = rdp['StrokeColor'] ? parseColor(rdp['StrokeColor']) : strokeColor;
        lineWith = rdp['LineWidth'] ? converterDpi(rdp['LineWidth']) : lineWith;
      }
      dp = drawParamResObj[drawParam] || dp;
    }
    if (dp['FillColor']) fillColor = parseColor(dp['FillColor']);
    if (dp['StrokeColor']) strokeColor = parseColor(dp['StrokeColor']);
    if (dp['LineWidth']) lineWith = converterDpi(dp['LineWidth']);
  }

  // 渲染图像对象
  for (const imageObject of collectLayerObjects(layer, 'ofd:ImageObject')) {
    let element = renderImageObject(pageDiv.style.width, pageDiv.style.height, multiMediaResObj, imageObject);
    if (element) fragment.appendChild(element);
  }

  // 渲染路径对象（Canvas 方式）
  const pathObjectArray = collectLayerObjects(layer, 'ofd:PathObject');
  if (pathObjectArray.length > 0) {
    const canvas = renderPathObjectsOnCanvas(pageDiv, drawParamResObj,
      pathObjectArray, fillColor, strokeColor, lineWith, isStampAnnot);
    if (canvas) fragment.appendChild(canvas);
  }

  // 渲染文本对象（SVG 方式）
  for (const textObject of collectLayerObjects(layer, 'ofd:TextObject')) {
    let svg = renderTextObject(fontResObj, textObject, fillColor);
    fragment.appendChild(svg);
  }
  pageDiv.appendChild(fragment);
};

// ============ 文本渲染 ============

/**
 * 创建 SVG 文本元素
 */
const createSvgTextElement = function (
  textCodePoint: { x: number; y: number; text: string },
  textObject: any, style: string, fillColor: string | null,
  fillOpacity: number, ctm: string | null, hScale: string | null
): SVGTextElement {
  let text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', textCodePoint.x.toString());
  text.setAttribute('y', textCodePoint.y.toString());
  text.setAttribute('xml:space', 'preserve');
  text.textContent = textCodePoint.text;
  if (ctm) {
    const ctms = parseCtm(ctm);
    text.setAttribute('transform',
      `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(parseFloat(ctms[4]))} ${converterDpi(parseFloat(ctms[5]))})`);
  }
  if (hScale) {
    const hs = parseFloat(hScale);
    text.setAttribute('transform', `matrix(${hs}, 0, 0, 1, ${(1 - hs) * textCodePoint.x}, 0)`);
  }
  text.setAttribute('fill', fillColor || 'black');
  text.setAttribute('fill-opacity', fillOpacity.toString());
  text.setAttribute('style', style);
  text.setAttribute('data-oid', textObject['@_ID']);
  return text;
};

// ============ 图像渲染 ============

/**
 * 获取图像边界（支持 CTM 变换）
 */
const getImageBoundary = function (imageObject: any): ST_Box {
  const boundary = parseStBox(imageObject['@_Boundary']);
  const ctm = imageObject['@_CTM'];
  if (ctm && boundary && boundary.x === 0 && boundary.y === 0) {
    const ctms = parseCtm(ctm);
    return {
      x: converterDpi(parseFloat(ctms[4])),
      y: converterDpi(parseFloat(ctms[5])),
      w: converterDpi(Math.abs(parseFloat(ctms[0]))),
      h: converterDpi(Math.abs(parseFloat(ctms[3]))),
    };
  }
  return boundary ? converterBox(boundary) : { x: 0, y: 0, w: 0, h: 0 };
};

/**
 * 渲染图像对象
 * JBIG2 图像使用 Canvas 渲染，其他使用 <img> 标签
 */
export const renderImageObject = function (
  pageWidth: string, pageHeight: string,
  multiMediaResObj: any, imageObject: any
): HTMLElement | null {
  const boundary = getImageBoundary(imageObject);
  const resId = imageObject['@_ResourceID'];
  const media = multiMediaResObj?.[resId];
  if (!media) {
    console.warn(`OFD image resource not found: ${resId}`);
    return null;
  }
  const zIndex = imageObject['pfIndex'] ?? imageObject['@_ID'] ?? 0;
  if (media.format === 'gbig2') {
    return renderImageOnCanvas(media.img, media.width, media.height, boundary, zIndex);
  } else {
    return renderImageOnDiv(pageWidth, pageHeight, media.img, boundary, null, false, null, null, zIndex);
  }
};

/**
 * 使用 Canvas 渲染二值图像（JBIG2）
 */
const renderImageOnCanvas = function (
  img: Uint8ClampedArray, imgWidth: number, imgHeight: number,
  boundary: ST_Box, oid: number
): HTMLCanvasElement {
  const arr = new Uint8ClampedArray(4 * imgWidth * imgHeight);
  for (var i = 0; i < img.length; i++) {
    arr[4 * i] = img[i];
    arr[4 * i + 1] = img[i];
    arr[4 * i + 2] = img[i];
    arr[4 * i + 3] = 255;
  }
  let imageData = new ImageData(arr, imgWidth, imgHeight);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = imgWidth;
  sourceCanvas.height = imgHeight;
  const sourceContext = sourceCanvas.getContext('2d')!;
  sourceContext.putImageData(imageData, 0, 0);

  const pixelRatio = window.devicePixelRatio || 1;
  let canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(boundary.w * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(boundary.h * pixelRatio));
  let context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.scale(pixelRatio, pixelRatio);
  context.drawImage(sourceCanvas, 0, 0, boundary.w, boundary.h);
  canvas.setAttribute('style',
    `position:absolute;left:${boundary.x}px;top:${boundary.y}px;
     width:${boundary.w}px;height:${boundary.h}px;z-index:${oid};
     image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;`);
  return canvas;
};

/**
 * 使用 DIV + <img> 渲染常规图像
 */
export const renderImageOnDiv = function (
  pageWidth: string, pageHeight: string, imgSrc: string,
  boundary: ST_Box, clip: ST_Box | null,
  isStampAnnot: boolean, SES_Signature: any, signedInfo: any, oid: number
): HTMLDivElement {
  let div = document.createElement('div');
  if (isStampAnnot) {
    div.setAttribute("name", "seal_img_div");
    div.setAttribute('data-ses-signature', JSON.stringify(SES_Signature));
    div.setAttribute('data-signed-info', JSON.stringify(signedInfo));
  }
  const pw = parseFloat(pageWidth.replace('px', ''));
  const ph = parseFloat(pageHeight.replace('px', ''));
  const w = boundary.w > pw ? pw : boundary.w;
  const h = boundary.h > ph ? ph : boundary.h;

  if (isStampAnnot) {
    const canvas = document.createElement('canvas');
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.ceil(w * pixelRatio));
    canvas.height = Math.max(1, Math.ceil(h * pixelRatio));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const img = new Image();
    img.onload = function () {
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.drawImage(img, 0, 0, w, h);
    };
    img.src = imgSrc;
    div.appendChild(canvas);
  } else {
    let img = document.createElement('img');
    img.src = imgSrc;
    img.decoding = 'sync';
    img.setAttribute('width', '100%');
    img.setAttribute('height', '100%');
    div.appendChild(img);
  }

  let c = '';
  if (clip) {
    let clipBox = converterBox(clip);
    c = `clip: rect(${clipBox.y}px, ${clipBox.w + clipBox.x}px, ${clipBox.h + clipBox.y}px, ${clipBox.x}px)`;
  }
  div.setAttribute('style',
    `cursor: pointer; overflow: hidden; position: absolute;
     left: ${c ? boundary.x : boundary.x < 0 ? 0 : boundary.x}px;
     top: ${c ? boundary.y : boundary.y < 0 ? 0 : boundary.y}px;
     width: ${w}px; height: ${h}px; ${c};z-index: ${oid};`);
  return div;
};

// ============ 文本对象渲染 ============

/**
 * 渲染 SVG 文本对象
 * GB/T 33190-2016 第 7.4.4 节 文本对象
 */
export const renderTextObject = function (
  fontResObj: any, textObject: any, defaultFillColor: string | null
): SVGSVGElement {
  let defaultFillOpacity = 1;
  let boundary = parseStBox(textObject['@_Boundary']);
  boundary = boundary ? converterBox(boundary) : { x: 0, y: 0, w: 0, h: 0 };
  const ctm = textObject['@_CTM'];
  const hScale = textObject['@_HScale'];
  const font = textObject['@_Font'];
  const weight = textObject['@_Weight'];
  const size = converterDpi(parseFloat(textObject['@_Size']));
  let textCodes: any[] = [].concat(textObject['ofd:TextCode'] || []);
  const textCodePointList = calTextPoint(textCodes);

  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('version', '1.1');

  const fillColor = textObject['ofd:FillColor'];
  if (fillColor) {
    defaultFillColor = parseColor(fillColor['@_Value']);
    let alpha = fillColor['@_Alpha'];
    if (alpha) defaultFillOpacity = alpha > 1 ? alpha / 255 : alpha;
  }

  const textStyle = `font-weight: ${weight};font-size:${size}px;font-family: ${getFontFamily(fontResObj[font])};`;
  for (const textCodePoint of textCodePointList) {
    if (textCodePoint && !isNaN(textCodePoint.x)) {
      const text = createSvgTextElement(textCodePoint, textObject, textStyle,
        defaultFillColor, defaultFillOpacity, ctm, hScale);
      svg.appendChild(text);
    }
  }

  let width = boundary.w;
  let height = boundary.h;
  let left = boundary.x;
  let top = boundary.y;
  svg.setAttribute('style',
    `overflow:visible;position:absolute;width:${width}px;height:${height}px;
     left:${left}px;top:${top}px;z-index:${textObject['pfIndex']}`);
  return svg;
};

// ============ 路径对象渲染 ============

const SVG_NS = 'http://www.w3.org/2000/svg';

const getDrawParam = function (drawParamResObj: any, drawParam: string): any {
  let obj = drawParamResObj?.[drawParam];
  if (obj?.relative) {
    obj = drawParamResObj?.[obj.relative] || obj;
  }
  return obj;
};

const getDrawParamColor = function (drawParamResObj: any, drawParam: string, colorKey: string): string | null {
  const color = getDrawParam(drawParamResObj, drawParam)?.[colorKey];
  return color ? parseColor(color) : null;
};

const parseAlpha = function (alpha: string | undefined): number {
  if (alpha === undefined || alpha === null || alpha === '') return 1;
  const value = parseFloat(alpha);
  if (isNaN(value)) return 1;
  return value > 1 ? value / 255 : value;
};

const getColorAlpha = function (colorObject: any): number {
  return parseAlpha(colorObject?.['@_Alpha']);
};

const getCanvasLineCap = function (lineCap: string | undefined): CanvasLineCap {
  if (lineCap === 'Butt') return 'butt';
  if (lineCap === 'Round') return 'round';
  if (lineCap === 'Square') return 'square';
  return 'butt';
};

const getCanvasLineJoin = function (join: string | undefined): CanvasLineJoin {
  if (join === 'Round') return 'round';
  if (join === 'Bevel') return 'bevel';
  return 'miter';
};

const getCanvasFillRule = function (rule: string | undefined): CanvasFillRule {
  return rule === 'Even-Odd' || rule === 'evenodd' ? 'evenodd' : 'nonzero';
};

const getPathD = function (points: PathPoint[]): string {
  let d = '';
  for (const point of points) {
    if (point.type === 'M') d += `M${point.x} ${point.y} `;
    else if (point.type === 'L') d += `L${point.x} ${point.y} `;
    else if (point.type === 'Q') d += `Q${point.x1} ${point.y1} ${point.x2} ${point.y2} `;
    else if (point.type === 'B') d += `C${point.x1} ${point.y1} ${point.x2} ${point.y2} ${point.x3} ${point.y3} `;
    else if (point.type === 'C') d += `Z`;
  }
  return d;
};

const getPathRenderStyle = function (
  drawParamResObj: any, pathObject: any,
  defaultFillColor: string | null, defaultStrokeColor: string | null,
  defaultLineWith: number
): any {
  let lineWidth = pathObject['@_LineWidth'];
  let fillAlpha = 1, strokeAlpha = 1;
  let lineCap = pathObject['@_Cap'];
  let lineJoin = pathObject['@_Join'];
  let miterLimit = pathObject['@_MiterLimit'];
  if (lineWidth) defaultLineWith = converterDpi(lineWidth);

  const drawParam = pathObject['@_DrawParam'];
  if (drawParam && drawParamResObj?.[drawParam]) {
    const dp = getDrawParam(drawParamResObj, drawParam);
    if (dp?.LineWidth) defaultLineWith = converterDpi(dp.LineWidth);
    defaultFillColor = getDrawParamColor(drawParamResObj, drawParam, 'FillColor') || defaultFillColor;
    defaultStrokeColor = getDrawParamColor(drawParamResObj, drawParam, 'StrokeColor') || defaultStrokeColor;
    fillAlpha = getColorAlpha(dp?.FillColorObject) || fillAlpha;
    strokeAlpha = getColorAlpha(dp?.StrokeColorObject) || strokeAlpha;
    lineCap = lineCap || dp?.Cap;
    lineJoin = lineJoin || dp?.Join;
    miterLimit = miterLimit || dp?.MiterLimit;
  }

  const strokeColorObj = pathObject['ofd:StrokeColor'];
  if (strokeColorObj) {
    defaultStrokeColor = parseColor(strokeColorObj['@_Value']);
    strokeAlpha = getColorAlpha(strokeColorObj);
  }
  const fillColorObj = pathObject['ofd:FillColor'];
  if (fillColorObj) {
    defaultFillColor = parseColor(fillColorObj['@_Value']);
    fillAlpha = getColorAlpha(fillColorObj);
  }
  if (defaultLineWith > 0 && !defaultStrokeColor && defaultFillColor) {
    defaultStrokeColor = defaultFillColor;
    strokeAlpha = fillAlpha;
  }

  return {
    lineWidth: defaultLineWith,
    strokeColor: pathObject['@_Stroke'] == 'false' ? null : defaultStrokeColor,
    fillColor: pathObject['@_Fill'] != 'false' ? defaultFillColor : null,
    strokeAlpha, fillAlpha,
    lineCap: getCanvasLineCap(lineCap),
    lineJoin: getCanvasLineJoin(lineJoin),
    miterLimit: miterLimit ? parseFloat(miterLimit) : 10,
    fillRule: getCanvasFillRule(pathObject['@_Rule']),
  };
};

const drawPathPoints = function (context: CanvasRenderingContext2D, points: PathPoint[]): void {
  context.beginPath();
  for (const point of points) {
    if (point.type === 'M') context.moveTo(point.x!, point.y!);
    else if (point.type === 'L') context.lineTo(point.x!, point.y!);
    else if (point.type === 'Q') context.quadraticCurveTo(point.x1!, point.y1!, point.x2!, point.y2!);
    else if (point.type === 'B') context.bezierCurveTo(point.x1!, point.y1!, point.x2!, point.y2!, point.x3!, point.y3!);
    else if (point.type === 'C') context.closePath();
  }
};

/**
 * 在 Canvas 上渲染路径对象列表
 * 支持 SVG Path 的 A (AbbreviatedData) 指令
 */
export const renderPathObjectsOnCanvas = function (
  pageDiv: HTMLElement, drawParamResObj: any, pathObjects: any[],
  defaultFillColor: string | null, defaultStrokeColor: string | null,
  defaultLineWith: number, isStampAnnot: boolean
): HTMLCanvasElement | null {
  const pageWidth = parseFloat(pageDiv.style.width.replace('px', ''));
  const pageHeight = parseFloat(pageDiv.style.height.replace('px', ''));
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const sortedPathObjects = pathObjects.slice().sort((a: any, b: any) => (a['pfIndex'] || 0) - (b['pfIndex'] || 0));
  const zIndex = Math.min(...sortedPathObjects.map((p: any) => p['pfIndex'] || 0));

  canvas.width = Math.ceil(pageWidth * pixelRatio);
  canvas.height = Math.ceil(pageHeight * pixelRatio);
  canvas.style.width = `${pageWidth}px`;
  canvas.style.height = `${pageHeight}px`;
  canvas.setAttribute('style',
    `position:absolute;left:0;top:0;width:${pageWidth}px;height:${pageHeight}px;z-index:${zIndex};pointer-events:none;`);
  context.scale(pixelRatio, pixelRatio);
  context.textRendering = 'geometricPrecision';

  for (const pathObject of sortedPathObjects) {
    let boundary = parseStBox(pathObject['@_Boundary']);
    if (!boundary) continue;
    boundary = converterBox(boundary);
    const abbreviatedData = pathObject['ofd:AbbreviatedData'];
    if (!abbreviatedData || boundary.w <= 0 || boundary.h <= 0) continue;

    const style = getPathRenderStyle(drawParamResObj, pathObject,
      defaultFillColor, defaultStrokeColor, defaultLineWith);
    if (!style.fillColor && !style.strokeColor) style.strokeColor = '#000000';

    const points = calPathPoint(convertPathAbbreviatedDatatoPoint(abbreviatedData));
    context.save();
    context.translate(boundary.x, boundary.y);

    const ctm = pathObject['@_CTM'];
    if (ctm) {
      const ctms = parseCtm(ctm);
      context.transform(parseFloat(ctms[0]), parseFloat(ctms[1]),
        parseFloat(ctms[2]), parseFloat(ctms[3]),
        converterDpi(parseFloat(ctms[4])), converterDpi(parseFloat(ctms[5])));
    }
    context.lineCap = style.lineCap as CanvasLineCap;
    context.lineJoin = style.lineJoin as CanvasLineJoin;
    context.miterLimit = style.miterLimit;
    drawPathPoints(context, points);
    if (style.fillColor) {
      context.globalAlpha = style.fillAlpha;
      context.fillStyle = style.fillColor;
      context.fill(style.fillRule as CanvasFillRule);
    }
    if (style.strokeColor) {
      context.globalAlpha = style.strokeAlpha;
      context.strokeStyle = style.strokeColor;
      context.lineWidth = style.lineWidth;
      context.stroke();
    }
    context.restore();
  }
  return canvas;
};

/**
 * 渲染单个路径对象（SVG 方式，用于电子签章场景）
 */
export const renderPathObject = function (
  drawParamResObj: any, pathObject: any,
  defaultFillColor: string | null, defaultStrokeColor: string | null,
  defaultLineWith: number, isStampAnnot: boolean
): SVGSVGElement | null {
  let boundary = parseStBox(pathObject['@_Boundary']);
  if (!boundary) return null;
  boundary = converterBox(boundary);
  const abbreviatedData = pathObject['ofd:AbbreviatedData'];
  if (!abbreviatedData || boundary.w <= 0 || boundary.h <= 0) return null;
  const points = calPathPoint(convertPathAbbreviatedDatatoPoint(abbreviatedData));
  const style = getPathRenderStyle(drawParamResObj, pathObject,
    defaultFillColor, defaultStrokeColor, defaultLineWith);
  if (!style.fillColor && !style.strokeColor) return null;

  const ctm = pathObject['@_CTM'];
  let svg = document.createElementNS(SVG_NS, 'svg');
  let path = document.createElementNS(SVG_NS, 'path');
  if (ctm) {
    const ctms = parseCtm(ctm);
    path.setAttribute('transform',
      `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(parseFloat(ctms[4]))} ${converterDpi(parseFloat(ctms[5]))})`);
  }
  const strokeStyle = style.strokeColor ? `stroke:${style.strokeColor};stroke-width:${style.lineWidth}px;` : '';
  const fillStyle = style.fillColor ? `fill:${style.fillColor};` : 'fill:none;';
  path.setAttribute('style', `${strokeStyle};${fillStyle}`);
  path.setAttribute('d', getPathD(points));
  svg.appendChild(path);

  let width = isStampAnnot ? boundary.w : Math.ceil(boundary.w);
  let height = isStampAnnot ? boundary.h : Math.ceil(boundary.h);
  svg.setAttribute('style',
    `overflow:visible;position:absolute;width:${width}px;height:${height}px;
     left:${boundary.x}px;top:${boundary.y}px;z-index:${pathObject['pfIndex']}`);
  return svg;
};
