/**
 * OFD 文档解析流水线
 *
 * 按照 OFD 标准（GB/T 33190-2016）解析 OFD 文档结构：
 * 1. OFD.xml 根文件 - 获取文档根
 * 2. Document.xml - 解析文档主结构
 * 3. 资源文件 - 字体、绘制参数、多媒体
 * 4. 模板页
 * 5. 内容页
 *
 * OFD 文件本质上是 ZIP 容器，内部包含 XML 文件和资源文件。
 */

// fast-xml-parser - generic XML -> JSON parser
// No OFD-specific logic here, just converts XML from OFD container to JSON
import { XMLParser } from 'fast-xml-parser';
import JsZip from "jszip";
import { parseStBox, getExtensionByPath, replaceFirstSlash } from "./ofd_util";
import { Jbig2Image } from '../jbig2/jbig2';
import { parseSesSignature } from "./ses_signature_parser";

/**
 * 执行 OFD 解析三步流水线：解压 -> 获取文档根 -> 解析文档
 * @param file - OFD 文件二进制数据（ArrayBuffer 或 File 对象）
 * @returns 解析完成的文档数组
 */
export const parseOfdSteps = async function (file: ArrayBuffer | File): Promise<any> {
  const zip = await unzipOfd(file);
  const docRoot = await getDocRoots(zip);
  return await parseSingleDoc(docRoot);
};

/**
 * 使用 JSZip 解压 OFD 文件
 * OFD 是 ZIP 容器格式，内部包含 XML 定义文件和资源文件
 * @param file - OFD 文件数据
 * @returns JSZip 实例
 */
export const unzipOfd = function (file: ArrayBuffer | File): Promise<any> {
  return new Promise((resolve, reject) => {
    JsZip.loadAsync(file)
      .then(function (zip) {
        resolve(zip);
      }, function (e) {
        reject(e);
      });
  });
};

/**
 * 从 OFD.xml 获取文档根信息
 * GB/T 33190-2016 第 5.2 节：OFD.xml 根文件
 * @param zip - JSZip 实例
 * @returns [zip, docbodies] - ZIP 实例和文档根数组
 */
export const getDocRoots = async function (zip: any): Promise<[any, any[]]> {
  const data = await getJsonFromXmlContent(zip, 'OFD.xml');
  const docbodys = data['json']['ofd:OFD']['ofd:DocBody'];
  let array: any[] = [];
  array = array.concat(docbodys);
  return [zip, array];
};

/**
 * 解析单个文档，按顺序执行所有解析步骤
 * @param [zip, array] - ZIP 实例和文档根数组
 * @returns 解析完成的文档列表
 */
export const parseSingleDoc = async function ([zip, array]: [any, any[]]): Promise<any[]> {
  let docs: any[] = [];
  for (let docbody of array) {
    if (docbody) {
      let res: any = await doGetDocRoot(zip, docbody);
      res = await getDocument(res);
      res = await getDocumentRes(res);
      res = await getPublicRes(res);
      res = await getTemplatePage(res);
      res = await getPage(res);
      docs.push(res);
    }
  }
  return docs;
};

/**
 * 获取文档根路径并处理签名信息
 * @param zip - JSZip 实例
 * @param docbody - 文档根对象
 * @returns [zip, doc, docRoot, stampAnnotArray]
 */
export const doGetDocRoot = async function (zip: any, docbody: any): Promise<[any, string, string, any]> {
  let docRoot = docbody['ofd:DocRoot'];
  docRoot = replaceFirstSlash(docRoot);
  const doc = docRoot.split('/')[0];
  const signatures = docbody['ofd:Signatures'];
  const stampAnnot = await getSignature(zip, signatures, doc);
  let stampAnnotArray: Record<string, any[]> = {};
  for (const stamp of stampAnnot) {
    if (stamp.sealObj && Object.keys(stamp.sealObj).length > 0) {
      if (stamp.sealObj.type === 'ofd') {
        // 印章图片是 OFD 格式，需要递归解析
        const stampObjs = await getSealDocumentObj(stamp);
        for (let stampObj of stampObjs) {
          stamp.stampAnnot.boundary = parseStBox(stamp.stampAnnot['@_Boundary']);
          stamp.stampAnnot.pageRef = stamp.stampAnnot['@_PageRef'];
          if (!stampAnnotArray[stamp.stampAnnot['@_PageRef']]) {
            stampAnnotArray[stamp.stampAnnot['@_PageRef']] = [];
          }
          stampAnnotArray[stamp.stampAnnot['@_PageRef']].push({ type: 'ofd', obj: stampObj, stamp });
        }
      } else if (stamp.sealObj.type === 'png') {
        // 印章图片是 PNG 格式
        let img = 'data:image/png;base64,' + btoa(String.fromCharCode.apply(null, stamp.sealObj.ofdArray as number[]));
        let stampArray: any[] = [];
        stampArray = stampArray.concat(stamp.stampAnnot);
        for (const annot of stampArray) {
          if (annot) {
            const stampObj = {
              img,
              pageId: annot['@_PageRef'],
              'boundary': parseStBox(annot['@_Boundary']),
              'clip': parseStBox(annot['@_Clip']),
            };
            if (!stampAnnotArray[annot['@_PageRef']]) {
              stampAnnotArray[annot['@_PageRef']] = [];
            }
            stampAnnotArray[annot['@_PageRef']].push({ type: 'png', obj: stampObj, stamp });
          }
        }
      }
    }
  }
  return [zip, doc, docRoot, stampAnnotArray];
};

/**
 * 解析 Document.xml 获取文档主结构
 * GB/T 33190-2016 第 6.2 节：文档主文件
 * @param args - [zip, doc, docRoot, stampAnnot]
 * @returns [zip, doc, documentObj, stampAnnot, annotationObjs]
 */
export const getDocument = async function ([zip, doc, docRoot, stampAnnot]: [any, string, string, any]): Promise<[any, string, any, any, any]> {
  const data = await getJsonFromXmlContent(zip, docRoot);
  const documentObj = data['json']['ofd:Document'];
  let annotations = documentObj['ofd:Annotations'];
  let array: any[] = [];
  let annoBase: string | undefined;
  if (annotations) {
    if (annotations.indexOf('/') !== -1) {
      annoBase = annotations.substring(0, annotations.indexOf('/'));
    }
    if (annotations.indexOf(doc) === -1) {
      annotations = `${doc}/${annotations}`;
    }
    if (zip.files[annotations]) {
      annotations = await getJsonFromXmlContent(zip, annotations);
      array = array.concat(annotations['json']['ofd:Annotations']['ofd:Page']);
    }
  }
  const annotationObjs = await getAnnotations(annoBase, array, doc, zip);
  return [zip, doc, documentObj, stampAnnot, annotationObjs];
};

/**
 * 解析注释信息
 * GB/T 33190-2016 第 9.2 节：注释
 * @param annoBase - 注释基础路径
 * @param annotations - 注释页列表
 * @param doc - 文档 ID
 * @param zip - JSZip 实例
 * @returns 注释对象映射
 */
const getAnnotations = async function (annoBase: string | undefined, annotations: any[], doc: string, zip: any): Promise<any> {
  let annotationObjs: Record<string, any[]> = {};
  for (let anno of annotations) {
    if (!anno) continue;
    const pageId = anno['@_PageID'];
    let fileLoc = anno['ofd:FileLoc'];
    fileLoc = replaceFirstSlash(fileLoc);
    if (annoBase && fileLoc.indexOf(annoBase) === -1) {
      fileLoc = `${annoBase}/${fileLoc}`;
    }
    if (fileLoc.indexOf(doc) === -1) {
      fileLoc = `${doc}/${fileLoc}`;
    }
    if (zip.files[fileLoc]) {
      const data = await getJsonFromXmlContent(zip, fileLoc);
      let array: any[] = [];
      array = array.concat(data['json']['ofd:PageAnnot']['ofd:Annot']);
      if (!annotationObjs[pageId]) {
        annotationObjs[pageId] = [];
      }
      for (let annot of array) {
        if (!annot) continue;
        const type = annot['@_Type'];
        const visible = annot['@_Visible'] ? annot['@_Visible'] : true;
        const appearance = annot['ofd:Appearance'];
        let appearanceObj = { type, appearance, visible };
        annotationObjs[pageId].push(appearanceObj);
      }
    }
  }
  return annotationObjs;
};

/**
 * 解析文档资源（DocumentRes）
 * 包括字体、绘制参数、多媒体资源
 * GB/T 33190-2016 第 6.3 节：资源
 * @param args - [zip, doc, Document, stampAnnot, annotationObjs]
 * @returns 包含资源对象的元组
 */
export const getDocumentRes = async function ([zip, doc, Document, stampAnnot, annotationObjs]: [any, string, any, any, any]): Promise<[any, string, any, any, any, any, any, any]> {
  let documentResPath = Document['ofd:CommonData']['ofd:DocumentRes'];
  let fontResObj: Record<string, string> = {};
  let drawParamResObj: Record<string, any> = {};
  let multiMediaResObj: Record<string, any> = {};
  if (documentResPath) {
    if (documentResPath.indexOf(doc) == -1) {
      documentResPath = `${doc}/${documentResPath}`;
    }
    if (zip.files[documentResPath]) {
      const data = await getJsonFromXmlContent(zip, documentResPath);
      const documentResObj = data['json']['ofd:Res'];
      fontResObj = await getFont(documentResObj);
      drawParamResObj = await getDrawParam(documentResObj);
      multiMediaResObj = await getMultiMediaRes(zip, documentResObj, doc);
    }
  }
  return [zip, doc, Document, stampAnnot, annotationObjs, fontResObj, drawParamResObj, multiMediaResObj];
};

/**
 * 解析公共资源（PublicRes）
 * @param args - 包含文档资源和状态
 * @returns 合并后的资源对象
 */
export const getPublicRes = async function ([zip, doc, Document, stampAnnot, annotationObjs, fontResObj, drawParamResObj, multiMediaResObj]: [any, string, any, any, any, any, any, any]): Promise<[any, string, any, any, any, any, any, any]> {
  let publicResPath = Document['ofd:CommonData']['ofd:PublicRes'];
  if (publicResPath) {
    if (publicResPath.indexOf(doc) == -1) {
      publicResPath = `${doc}/${publicResPath}`;
    }
    if (zip.files[publicResPath]) {
      const data = await getJsonFromXmlContent(zip, publicResPath);
      const publicResObj = data['json']['ofd:Res'];
      let fontObj = await getFont(publicResObj);
      fontResObj = Object.assign(fontResObj, fontObj);
      let drawParamObj = await getDrawParam(publicResObj);
      drawParamResObj = Object.assign(drawParamResObj, drawParamObj);
      let multiMediaObj = await getMultiMediaRes(zip, publicResObj, doc);
      multiMediaResObj = Object.assign(multiMediaResObj, multiMediaObj);
    }
  }
  return [zip, doc, Document, stampAnnot, annotationObjs, fontResObj, drawParamResObj, multiMediaResObj];
};

/**
 * 解析模板页
 * GB/T 33190-2016 第 10.2 节：模板页
 * @param args - 包含文档资源和状态
 * @returns 包含模板页对象的元组
 */
export const getTemplatePage = async function ([zip, doc, Document, stampAnnot, annotationObjs, fontResObj, drawParamResObj, multiMediaResObj]: [any, string, any, any, any, any, any, any]): Promise<[any, string, any, any, any, any, any, any, any]> {
  let templatePages = Document['ofd:CommonData']['ofd:TemplatePage'];
  let array: any[] = [];
  array = array.concat(templatePages);
  let tpls: Record<string, any> = {};
  for (const templatePage of array) {
    if (templatePage) {
      let pageObj = await parsePage(zip, templatePage, doc);
      tpls[Object.keys(pageObj)[0]] = pageObj[Object.keys(pageObj)[0]];
    }
  }
  return [zip, doc, Document, stampAnnot, annotationObjs, tpls, fontResObj, drawParamResObj, multiMediaResObj];
};

/**
 * 解析内容页
 * GB/T 33190-2016 第 10.1 节：内容页
 * @param args - 包含所有解析状态
 * @returns 文档对象
 */
export const getPage = async function ([zip, doc, Document, stampAnnot, annotationObjs, tpls, fontResObj, drawParamResObj, multiMediaResObj]: [any, string, any, any, any, any, any, any, any]): Promise<any> {
  let pages = Document['ofd:Pages']['ofd:Page'];
  let array: any[] = [];
  array = array.concat(pages);
  let res: any[] = [];
  for (const page of array) {
    if (page) {
      let pageObj = await parsePage(zip, page, doc);
      const pageId = Object.keys(pageObj)[0];
      const currentPageStamp = stampAnnot[pageId];
      if (currentPageStamp) {
        pageObj[pageId].stamp = currentPageStamp;
      }
      const annotationObj = annotationObjs[pageId];
      if (annotationObj) {
        pageObj[pageId].annotation = annotationObj;
      }
      res.push(pageObj);
    }
  }
  return {
    'doc': doc,
    'document': Document,
    'pages': res,
    'tpls': tpls,
    'stampAnnot': stampAnnot,
    fontResObj,
    drawParamResObj,
    multiMediaResObj,
  };
};

/**
 * 解析字体资源
 * @param res - 资源对象
 * @returns 字体名称映射 {fontID: fontName}
 */
const getFont = async function (res: any): Promise<Record<string, string>> {
  const fonts = res['ofd:Fonts'];
  let fontResObj: Record<string, string> = {};
  if (fonts) {
    let fontArray: any[] = [];
    fontArray = fontArray.concat(fonts['ofd:Font']);
    for (const font of fontArray) {
      if (font) {
        fontResObj[font['@_ID']] = font['@_FamilyName'] || font['@_FontName'];
      }
    }
  }
  return fontResObj;
};

/**
 * 解析绘制参数资源
 * GB/T 33190-2016 第 7.6 节：绘制参数
 * @param res - 资源对象
 * @returns 绘制参数映射
 */
const getDrawParam = async function (res: any): Promise<Record<string, any>> {
  const drawParams = res['ofd:DrawParams'];
  let drawParamResObj: Record<string, any> = {};
  if (drawParams) {
    let array: any[] = [];
    array = array.concat(drawParams['ofd:DrawParam']);
    for (const item of array) {
      if (item) {
        drawParamResObj[item['@_ID']] = {
          'LineWidth': item['@_LineWidth'],
          'FillColor': item['ofd:FillColor'] ? item['ofd:FillColor']['@_Value'] : '',
          'StrokeColor': item['ofd:StrokeColor'] ? item['ofd:StrokeColor']['@_Value'] : "",
          'relative': item['@_Relative'],
        };
      }
    }
  }
  return drawParamResObj;
};

/**
 * 解析多媒体资源（图像等）
 * 支持 JBIG2 压缩格式和常规图像格式
 * @param zip - JSZip 实例
 * @param res - 资源对象
 * @param doc - 文档 ID
 * @returns 多媒体资源映射
 */
const getMultiMediaRes = async function (zip: any, res: any, doc: string): Promise<Record<string, any>> {
  const multiMedias = res['ofd:MultiMedias'];
  let multiMediaResObj: Record<string, any> = {};
  if (multiMedias) {
    let array: any[] = [];
    array = array.concat(multiMedias['ofd:MultiMedia']);
    for (const item of array) {
      if (item) {
        let file = item['ofd:MediaFile'];
        if (res['@_BaseLoc']) {
          if (file.indexOf(res['@_BaseLoc']) === -1) {
            file = `${res['@_BaseLoc']}/${file}`;
          }
        }
        if (file.indexOf(doc) === -1) {
          file = `${doc}/${file}`;
        }
        if (item['@_Type'].toLowerCase() === 'image') {
          const format = item['@_Format'];
          const ext = getExtensionByPath(file);
          if ((format && (format.toLowerCase() === 'gbig2' || format.toLowerCase() === 'jb2')) ||
            (ext && (ext.toLowerCase() === 'jb2' || ext.toLowerCase() === 'gbig2'))) {
            const jbig2 = await parseJbig2ImageFromZip(zip, file);
            multiMediaResObj[item['@_ID']] = jbig2;
          } else {
            const img = await parseOtherImageFromZip(zip, file);
            multiMediaResObj[item['@_ID']] = { img, 'format': 'png' };
          }
        } else {
          multiMediaResObj[item['@_ID']] = file;
        }
      }
    }
  }
  return multiMediaResObj;
};

/**
 * 解析单个页面
 * @param zip - JSZip 实例
 * @param obj - 页面对象
 * @param doc - 文档 ID
 * @returns 页面对象
 */
const parsePage = async function (zip: any, obj: any, doc: string): Promise<any> {
  let pagePath = obj['@_BaseLoc'];
  if (pagePath.indexOf(doc) == -1) {
    pagePath = `${doc}/${pagePath}`;
  }
  const data = await getJsonFromXmlContent(zip, pagePath);
  let pageObj: Record<string, any> = {};
  pageObj[obj['@_ID']] = { 'json': data['json']['ofd:Page'], 'xml': data['xml'] };
  return pageObj;
};

/**
 * 获取签名数据
 * GB/T 33190-2016 第 8.3 节：电子签名
 * @param zip - JSZip 实例
 * @param signatures - 签名文件路径
 * @param doc - 文档 ID
 * @returns 签名信息列表
 */
const getSignature = async function (zip: any, signatures: string, doc: string): Promise<any[]> {
  let stampAnnot: any[] = [];
  if (signatures) {
    signatures = replaceFirstSlash(signatures);
    if (signatures.indexOf(doc) === -1) {
      signatures = `${doc}/${signatures}`;
    }
    if (zip.files[signatures]) {
      let data = await getJsonFromXmlContent(zip, signatures);
      let signature = data['json']['ofd:Signatures']['ofd:Signature'];
      let signatureArray: any[] = [];
      signatureArray = signatureArray.concat(signature);
      for (const sign of signatureArray) {
        if (sign) {
          let signatureLoc = sign['@_BaseLoc'];
          let signatureID = sign['@_ID'];
          signatureLoc = replaceFirstSlash(signatureLoc);
          if (signatureLoc.indexOf('Signs') === -1) {
            signatureLoc = `Signs/${signatureLoc}`;
          }
          if (signatureLoc.indexOf(doc) === -1) {
            signatureLoc = `${doc}/${signatureLoc}`;
          }
          stampAnnot.push(await getSignatureData(zip, signatureLoc, signatureID));
        }
      }
    }
  }
  return stampAnnot;
};

/**
 * 获取签名详情数据
 * @param zip - JSZip 实例
 * @param name - 签名文件名
 * @param signatureID - 签名 ID
 * @returns 签名详情
 */
const getSignatureData = async function (zip: any, signature: string, signatureID: string): Promise<any> {
  const data = await getJsonFromXmlContent(zip, signature);
  let signedValue = (data['json']['ofd:Signature']['ofd:SignedValue']);
  signedValue = signedValue.toString().replace('/', '');
  if (!zip.files[signedValue]) {
    signedValue = `${signature.substring(0, signature.lastIndexOf('/'))}/${signedValue}`;
  }
  let sealObj = await parseSesSignature(zip, signedValue);
  const checkMethod = data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:References']['@_CheckMethod'];
  (globalThis as any).toBeChecked = new Map();
  let arr: Array<{ fileData: Uint8Array; hashed: string; checkMethod: string }> = [];
  const references = data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:References']['ofd:Reference'];
  const refArray: any[] = [].concat(references);
  for (const reference of refArray) {
    if (!reference || Object.keys(reference).length === 0 || !reference['@_FileRef'] || Object.keys(reference['@_FileRef']).length === 0) {
      continue;
    }
    const hashed = reference['ofd:CheckValue'];
    const key = reference['@_FileRef'].replace('/', '');
    const fileData = await getFileData(zip, key);
    arr.push({ fileData, hashed, checkMethod });
  }
  (globalThis as any).toBeChecked.set(signatureID, arr);
  return {
    'stampAnnot': data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:StampAnnot'],
    'sealObj': sealObj,
    'signedInfo': {
      'signatureID': signatureID,
      'VerifyRet': sealObj.verifyRet,
      'Provider': data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:Provider'],
      'SignatureMethod': data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:SignatureMethod'],
      'SignatureDateTime': data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:SignatureDateTime'],
    },
  };
};

/**
 * 从 ZIP 获取文件二进制数据
 */
const getFileData = async function (zip: any, name: string): Promise<Uint8Array> {
  return zip.files[name].async('uint8array');
};

/**
 * 递归解析印章文档（OFD 格式的印章）
 * 印章本身可能是 OFD 格式，需要递归解析
 */
const getSealDocumentObj = async function (stampAnnot: any): Promise<any> {
  return parseOfdSteps(stampAnnot.sealObj.ofdArray);
};

/**
 * 从 ZIP 中读取 XML 并解析为 JSON
 * @param zip - JSZip 实例
 * @param xmlName - XML 文件路径
 * @returns 解析结果（包含原始 XML 和 JSON）
 */
const getJsonFromXmlContent = async function (zip: any, xmlName: string): Promise<{ xml: string; json: any }> {
  return new Promise((resolve, reject) => {
    if (xmlName === 'Doc_0/TPLS/Tpl_0/Content.xml') {
      xmlName = 'Doc_0/Tpls/Tpl_0/Content.xml';
    }
    zip.files[xmlName].async('string').then(function (content: string) {
      let ops = {
        attributeNamePrefix: "@_",
        ignoreAttributes: false,
        parseNodeValue: false,
        trimValues: false,
      };
      const parser = new XMLParser(ops);
      let jsonObj = parser.parse(content);
      let result = { 'xml': content, 'json': jsonObj };
      resolve(result);
    }, function error(e: Error) {
      reject(e);
    });
  });
};

/**
 * 从 ZIP 解析 JBIG2 格式图像
 * @param zip - JSZip 实例
 * @param name - 文件名
 * @returns 解码后的图像数据
 */
const parseJbig2ImageFromZip = async function (zip: any, name: string): Promise<{ img: any; width: number; height: number; format: string }> {
  return new Promise((resolve, reject) => {
    zip.files[name].async('uint8array').then(function (bytes: Uint8Array) {
      let jbig2 = new Jbig2Image();
      const img = jbig2.parse(bytes);
      resolve({ img, width: jbig2.width, height: jbig2.height, format: 'gbig2' });
    }, function error(e: Error) {
      reject(e);
    });
  });
};

/**
 * 从 ZIP 解析其他格式图像
 * @param zip - JSZip 实例
 * @param name - 文件名
 * @returns Base64 编码的图像数据
 */
const parseOtherImageFromZip = async function (zip: any, name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (name.startsWith('/')) {
      name = name.substring(1);
    }
    zip.files[name].async('base64').then(function (bytes: string) {
      const img = 'data:image/png;base64,' + bytes;
      resolve(img);
    }, function error(e: Error) {
      reject(e);
    });
  });
};
