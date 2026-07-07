/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * JBIG2 图像解码器
 * 实现 ISO/IEC 14492 JBIG2 二值图像压缩标准
 *
 * 在 OFD 文档格式中，JBIG2 用于压缩电子签章图像，
 * 可实现高压缩率的黑白图像编码（通常为印章、公章图案）。
 * 参见 GB/T 33190-2016 电子文件存储与交换格式 第 7.7 节
 */

import { BaseException, shadow } from "./util";
import { log2, readInt8, readUint16, readUint32 } from "./core_utils";
import { ArithmeticDecoder } from "./arithmetic_decoder";
import { CCITTFaxDecoder } from "./ccitt";

class Jbig2Error extends BaseException {
  constructor(msg: string) {
    super(`JBIG2 error: ${msg}`);
  }
}

// ============ 数据结构 ============

/**
 * Context cache for arithmetic decoding contexts.
 * Lazily creates a new Int8Array (65536 entries) per context ID.
 */
class ContextCache {
  getContexts(id: string): Int8Array {
    return (this as any)[id] ?? ((this as any)[id] = new Int8Array(1 << 16));
  }
}

/**
 * A decoding context bundles the raw byte data with its arithmetic
 * decoder and context cache. The decoder and cache are created lazily
 * (via getters) to avoid unnecessary work when they are not needed.
 */
class DecodingContext {
  data: Uint8Array;
  start: number;
  end: number;

  constructor(data: Uint8Array, start: number, end: number) {
    this.data = data;
    this.start = start;
    this.end = end;
  }

  get decoder(): ArithmeticDecoder {
    return shadow(this, "decoder", new ArithmeticDecoder(this.data, this.start, this.end));
  }

  get contextCache(): ContextCache {
    return shadow(this, "contextCache", new ContextCache());
  }
}

// ============ 附录 A.2 整数解码 ============
function decodeInteger(contextCache: any, procedure: string, decoder: ArithmeticDecoder): number | null {
  var contexts = contextCache.getContexts(procedure);
  var prev = 1;

  function readBits(length: number) {
    var v = 0;
    for (var i = 0; i < length; i++) {
      var bit = decoder.readBit(contexts, prev);
      prev = prev < 256 ? (prev << 1) | bit : (((prev << 1) | bit) & 511) | 256;
      v = (v << 1) | bit;
    }
    return v >>> 0;
  }

  var sign = readBits(1);
  var value = readBits(1)
    ? (readBits(1)
      ? (readBits(1)
        ? (readBits(1)
          ? (readBits(1) ? readBits(32) + 4436 : readBits(12) + 340)
          : readBits(8) + 84)
        : readBits(6) + 20)
      : readBits(4) + 4)
    : readBits(2);

  if (sign === 0) return value;
  else if (value > 0) return -value;
  return null;
}

// 附录 A.3 IAID 解码
function decodeIAID(contextCache: any, decoder: ArithmeticDecoder, codeLength: number): number {
  var contexts = contextCache.getContexts("IAID");
  var prev = 1;
  for (var i = 0; i < codeLength; i++) {
    var bit = decoder.readBit(contexts, prev);
    prev = (prev << 1) | bit;
  }
  if (codeLength < 31) return prev & ((1 << codeLength) - 1);
  return prev & 0x7fffffff;
}

// ============ 7.3 段类型 ============
var SegmentTypes = [
  "SymbolDictionary", null, null, null,
  "IntermediateTextRegion", null,
  "ImmediateTextRegion", "ImmediateLosslessTextRegion",
  null, null, null, null, null, null, null, null,
  "PatternDictionary", null, null, null,
  "IntermediateHalftoneRegion", null,
  "ImmediateHalftoneRegion", "ImmediateLosslessHalftoneRegion",
  null, null, null, null, null, null, null, null,
  null, null, null, null,
  "IntermediateGenericRegion", null,
  "ImmediateGenericRegion", "ImmediateLosslessGenericRegion",
  "IntermediateGenericRefinementRegion", null,
  "ImmediateGenericRefinementRegion", "ImmediateLosslessGenericRefinementRegion",
  null, null, null, null,
  "PageInformation", "EndOfPage", "EndOfStripe", "EndOfFile",
  "Profiles", "Tables", null, null, null, null, null, null, null, null,
  "Extension",
];

// ============ 编码模板 ============
var CodingTemplates = [
  [{ x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 },
    { x: -2, y: -1 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
    { x: -4, y: 0 }, { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }],
  [{ x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -2 },
    { x: -2, y: -1 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 },
    { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }],
  [{ x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 },
    { x: -2, y: -1 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -2, y: 0 }, { x: -1, y: 0 }],
  [{ x: -3, y: -1 }, { x: -2, y: -1 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -4, y: 0 }, { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }],
];

var RefinementTemplates = [
  { coding: [{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }],
    reference: [{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 },
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { coding: [{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }],
    reference: [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }] },
];

var ReusedContexts = [0x9b25, 0x0795, 0x00e5, 0x0195];
var RefinementReusedContexts = [0x0020, 0x0008];

// ============ 6.2.6 模板0解码 ============
function decodeBitmapTemplate0(width: number, height: number, decodingContext: any): Uint8Array[] {
  var decoder = decodingContext.decoder;
  var contexts = decodingContext.contextCache.getContexts("GB");
  var contextLabel: number, i: number, j: number, pixel: number;
  var row: Uint8Array, row1: Uint8Array, row2: Uint8Array;
  var bitmap: Uint8Array[] = [];
  var OLD_PIXEL_MASK = 0x7bf7;

  for (i = 0; i < height; i++) {
    row = bitmap[i] = new Uint8Array(width);
    row1 = i < 1 ? row : bitmap[i - 1];
    row2 = i < 2 ? row : bitmap[i - 2];

    contextLabel = (row2[0] << 13) | (row2[1] << 12) | (row2[2] << 11) |
      (row1[0] << 7) | (row1[1] << 6) | (row1[2] << 5) | (row1[3] << 4);

    for (j = 0; j < width; j++) {
      row[j] = pixel = decoder.readBit(contexts, contextLabel);
      contextLabel = ((contextLabel & OLD_PIXEL_MASK) << 1) |
        (j + 3 < width ? row2[j + 3] << 11 : 0) |
        (j + 4 < width ? row1[j + 4] << 4 : 0) | pixel;
    }
  }
  return bitmap;
}

// ============ 6.2 通用区域解码 ============
function decodeBitmap(
  mmr: boolean, width: number, height: number,
  templateIndex: number, prediction: boolean, skip: Uint8Array[] | null,
  at: { x: number; y: number }[], decodingContext: any
): Uint8Array[] {
  if (mmr) {
    const input = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);
    return decodeMMRBitmap(input, width, height, false);
  }
  if (templateIndex === 0 && !skip && !prediction && at.length === 4 &&
    at[0].x === 3 && at[0].y === -1 && at[1].x === -3 && at[1].y === -1 &&
    at[2].x === 2 && at[2].y === -2 && at[3].x === -2 && at[3].y === -2) {
    return decodeBitmapTemplate0(width, height, decodingContext);
  }

  var useskip = !!skip;
  var template = CodingTemplates[templateIndex].concat(at);
  template.sort(function (a, b) { return a.y - b.y || a.x - b.x; });

  var templateLength = template.length;
  var templateX = new Int8Array(templateLength);
  var templateY = new Int8Array(templateLength);
  var changingTemplateEntries: number[] = [];
  var reuseMask = 0, minX = 0, maxX = 0, minY = 0;
  var k: number;

  for (k = 0; k < templateLength; k++) {
    templateX[k] = template[k].x;
    templateY[k] = template[k].y;
    minX = Math.min(minX, template[k].x);
    maxX = Math.max(maxX, template[k].x);
    minY = Math.min(minY, template[k].y);
    if (k < templateLength - 1 && template[k].y === template[k + 1].y &&
      template[k].x === template[k + 1].x - 1) {
      reuseMask |= 1 << (templateLength - 1 - k);
    } else {
      changingTemplateEntries.push(k);
    }
  }

  var changingEntriesLength = changingTemplateEntries.length;
  var changingTemplateX = new Int8Array(changingEntriesLength);
  var changingTemplateY = new Int8Array(changingEntriesLength);
  var changingTemplateBit = new Uint16Array(changingEntriesLength);
  for (var c = 0; c < changingEntriesLength; c++) {
    k = changingTemplateEntries[c];
    changingTemplateX[c] = template[k].x;
    changingTemplateY[c] = template[k].y;
    changingTemplateBit[c] = 1 << (templateLength - 1 - k);
  }

  var sbb_left = -minX, sbb_top = -minY, sbb_right = width - maxX;
  var pseudoPixelContext = ReusedContexts[templateIndex];
  var row = new Uint8Array(width);
  var bitmap: Uint8Array[] = [];
  var decoder = decodingContext.decoder;
  var contexts = decodingContext.contextCache.getContexts("GB");
  var ltp = 0;
      var contextLabel = 0;
  for (var i = 0; i < height; i++) {
    if (prediction) {
      var sltp = decoder.readBit(contexts, pseudoPixelContext);
      ltp ^= sltp;
      if (ltp) { bitmap.push(row); continue; }
    }
    row = new Uint8Array(row);
    bitmap.push(row);
    for (var j = 0; j < width; j++) {
      if (useskip && skip![i][j]) { row[j] = 0; continue; }
      if (j >= sbb_left && j < sbb_right && i >= sbb_top) {
        contextLabel = (contextLabel << 1) & reuseMask;
        for (k = 0; k < changingEntriesLength; k++) {
          var i0 = i + changingTemplateY[k], j0 = j + changingTemplateX[k];
          var bit = bitmap[i0][j0];
          if (bit) contextLabel |= changingTemplateBit[k];
        }
      } else {
        contextLabel = 0;
        var shift = templateLength - 1;
        for (k = 0; k < templateLength; k++, shift--) {
          j0 = j + templateX[k];
          if (j0 >= 0 && j0 < width) {
            i0 = i + templateY[k];
            if (i0 >= 0) { if (bitmap[i0][j0]) contextLabel |= 1 << shift; }
          }
        }
      }
      row[j] = decoder.readBit(contexts, contextLabel);
    }
  }
  return bitmap;
}

// ============ 6.3 优化解码 ============
function decodeRefinement(
  width: number, height: number, templateIndex: number,
  referenceBitmap: Uint8Array[], offsetX: number, offsetY: number,
  prediction: boolean, at: { x: number; y: number }[], decodingContext: any
): Uint8Array[] {
  var codingTemplate = RefinementTemplates[templateIndex].coding;
  if (templateIndex === 0) {
    codingTemplate = codingTemplate.concat([at[0]]);
  }
  var codingTemplateLength = codingTemplate.length;
  var codingTemplateX = new Int32Array(codingTemplateLength);
  var codingTemplateY = new Int32Array(codingTemplateLength);
  for (var k = 0; k < codingTemplateLength; k++) {
    codingTemplateX[k] = codingTemplate[k].x;
    codingTemplateY[k] = codingTemplate[k].y;
  }

  var referenceTemplate = RefinementTemplates[templateIndex].reference;
  if (templateIndex === 0) {
    referenceTemplate = referenceTemplate.concat([at[1]]);
  }
  var referenceTemplateLength = referenceTemplate.length;
  var referenceTemplateX = new Int32Array(referenceTemplateLength);
  var referenceTemplateY = new Int32Array(referenceTemplateLength);
  for (k = 0; k < referenceTemplateLength; k++) {
    referenceTemplateX[k] = referenceTemplate[k].x;
    referenceTemplateY[k] = referenceTemplate[k].y;
  }
  var referenceWidth = referenceBitmap[0].length;
  var referenceHeight = referenceBitmap.length;

  var pseudoPixelContext = RefinementReusedContexts[templateIndex];
  var bitmap: Uint8Array[] = [];
  var decoder = decodingContext.decoder;
  var contexts = decodingContext.contextCache.getContexts("GR");
  var ltp = 0;
  for (var i = 0; i < height; i++) {
    if (prediction) {
      throw new Jbig2Error("prediction is not supported");
    }
    var row = new Uint8Array(width);
    bitmap.push(row);
    for (var j = 0; j < width; j++) {
      var contextLabel = 0;
      for (k = 0; k < codingTemplateLength; k++) {
        var i0 = i + codingTemplateY[k], j0 = j + codingTemplateX[k];
        contextLabel = (contextLabel << 1) | (i0 < 0 || j0 < 0 || j0 >= width ? 0 : bitmap[i0][j0]);
      }
      for (k = 0; k < referenceTemplateLength; k++) {
        i0 = i + referenceTemplateY[k] - offsetY;
        j0 = j + referenceTemplateX[k] - offsetX;
        contextLabel = (contextLabel << 1) |
          (i0 < 0 || i0 >= referenceHeight || j0 < 0 || j0 >= referenceWidth ? 0 : referenceBitmap[i0][j0]);
      }
      row[j] = decoder.readBit(contexts, contextLabel);
    }
  }
  return bitmap;
}

// ============ 6.5 符号字典解码 ============
function decodeSymbolDictionary(
  huffman: boolean, refinement: boolean, symbols: Uint8Array[][],
  numberOfNewSymbols: number, numberOfExportedSymbols: number,
  huffmanTables: any, templateIndex: number, at: { x: number; y: number }[],
  refinementTemplateIndex: number, refinementAt: { x: number; y: number }[],
  decodingContext: any, huffmanInput: any
): Uint8Array[][] {
  if (huffman && refinement) throw new Jbig2Error("symbol refinement with Huffman is not supported");

  var newSymbols: Uint8Array[][] = [];
  var currentHeight = 0;
  var symbolCodeLength = log2(symbols.length + numberOfNewSymbols);
  var decoder = decodingContext.decoder;
  var contextCache = decodingContext.contextCache;
  var tableB1: any, symbolWidths: number[];
  if (huffman) {
    tableB1 = getStandardTable(1);
    symbolWidths = [];
    symbolCodeLength = Math.max(symbolCodeLength, 1);
  }

  while (newSymbols.length < numberOfNewSymbols) {
    var deltaHeight = huffman ? huffmanTables.tableDeltaHeight.decode(huffmanInput) :
      decodeInteger(contextCache, "IADH", decoder);
    currentHeight += deltaHeight!;
    var currentWidth = 0, totalWidth = 0;
    const firstSymbol = huffman ? symbolWidths!.length : 0;
    while (true) {
      var deltaWidth = huffman ? huffmanTables.tableDeltaWidth.decode(huffmanInput) :
        decodeInteger(contextCache, "IADW", decoder);
      if (deltaWidth === null) break;
      currentWidth += deltaWidth;
      totalWidth += currentWidth;
      var bitmap: Uint8Array[];
      if (refinement) {
        var numberOfInstances = decodeInteger(contextCache, "IAAI", decoder) as number;
        if (numberOfInstances > 1) {
          bitmap = decodeTextRegion(huffman, refinement, currentWidth, currentHeight,
            0, numberOfInstances, 1, symbols.concat(newSymbols), symbolCodeLength,
            false as any, 0, 1, 0, huffmanTables, refinementTemplateIndex, refinementAt,
            decodingContext, 0, huffmanInput);
        } else {
          var symbolId = decodeIAID(contextCache, decoder, symbolCodeLength);
          var rdx = decodeInteger(contextCache, "IARDX", decoder) as number;
          var rdy = decodeInteger(contextCache, "IARDY", decoder) as number;
          var symbol = symbolId < symbols.length ? symbols[symbolId] :
            newSymbols[symbolId - symbols.length];
          bitmap = decodeRefinement(currentWidth, currentHeight, refinementTemplateIndex,
            symbol, rdx, rdy, false, refinementAt, decodingContext);
        }
        newSymbols.push(bitmap);
      } else if (huffman) {
        symbolWidths!.push(currentWidth);
      } else {
        bitmap = decodeBitmap(false, currentWidth, currentHeight, templateIndex,
          false, null, at, decodingContext);
        newSymbols.push(bitmap);
      }
    }
    if (huffman && !refinement) {
      const bitmapSize = huffmanTables.tableBitmapSize.decode(huffmanInput);
      huffmanInput.byteAlign();
      let collectiveBitmap: Uint8Array[];
      if (bitmapSize === 0) {
        collectiveBitmap = readUncompressedBitmap(huffmanInput, totalWidth, currentHeight);
      } else {
        const originalEnd = huffmanInput.end;
        const bitmapEnd = huffmanInput.position + bitmapSize;
        huffmanInput.end = bitmapEnd;
        collectiveBitmap = decodeMMRBitmap(huffmanInput, totalWidth, currentHeight, false);
        huffmanInput.end = originalEnd;
        huffmanInput.position = bitmapEnd;
      }
      const numberOfSymbolsDecoded = symbolWidths!.length;
      if (firstSymbol === numberOfSymbolsDecoded - 1) {
        newSymbols.push(collectiveBitmap);
      } else {
        var xMin = 0, xMax: number;
        for (var i = firstSymbol; i < numberOfSymbolsDecoded; i++) {
          var bw = symbolWidths![i];
          xMax = xMin + bw;
          var symBmp: Uint8Array[] = [];
          for (var y = 0; y < currentHeight; y++) {
            symBmp.push(collectiveBitmap[y].subarray(xMin, xMax));
          }
          newSymbols.push(symBmp);
          xMin = xMax;
        }
      }
    }
  }

  var exportedSymbols: Uint8Array[][] = [];
  var flags: boolean[] = [], currentFlag = false;
  var totalSymbolsLength = symbols.length + numberOfNewSymbols;
  while (flags.length < totalSymbolsLength) {
    var runLength = huffman ? tableB1!.decode(huffmanInput) :
      decodeInteger(contextCache, "IAEX", decoder) as number;
    while (runLength--) { flags.push(currentFlag); }
    currentFlag = !currentFlag;
  }
  for (var i = 0, ii = symbols.length; i < ii; i++) {
    if (flags[i]) exportedSymbols.push(symbols[i]);
  }
  for (var j = 0; j < numberOfNewSymbols; i++, j++) {
    if (flags[i]) exportedSymbols.push(newSymbols[j]);
  }
  return exportedSymbols;
}

// ============ 6.4 文本区域解码 ============
function decodeTextRegion(
  huffman: boolean, refinement: boolean, width: number, height: number,
  defaultPixelValue: number, numberOfSymbolInstances: number, stripSize: number,
  inputSymbols: Uint8Array[][], symbolCodeLength: number, transposed: boolean,
  dsOffset: number, referenceCorner: number, combinationOperator: number,
  huffmanTables: any, refinementTemplateIndex: number,
  refinementAt: { x: number; y: number }[],
  decodingContext: any, logStripSize: number, huffmanInput: any
): Uint8Array[] {
  if (huffman && refinement) throw new Jbig2Error("refinement with Huffman is not supported");

  var bitmap: Uint8Array[] = [];
  for (var i = 0; i < height; i++) {
    var row = new Uint8Array(width);
    if (defaultPixelValue) { for (var j = 0; j < width; j++) row[j] = defaultPixelValue; }
    bitmap.push(row);
  }

  var decoder = decodingContext.decoder;
  var contextCache = decodingContext.contextCache;
  var stripT = huffman ? -huffmanTables.tableDeltaT.decode(huffmanInput) :
    -(decodeInteger(contextCache, "IADT", decoder) as number);
  var firstS = 0;
  i = 0;
  while (i < numberOfSymbolInstances) {
    var deltaT = huffman ? huffmanTables.tableDeltaT.decode(huffmanInput) :
      decodeInteger(contextCache, "IADT", decoder) as number;
    stripT += deltaT;
    var deltaFirstS = huffman ? huffmanTables.tableFirstS.decode(huffmanInput) :
      decodeInteger(contextCache, "IAFS", decoder) as number;
    firstS += deltaFirstS;
    var currentS = firstS;
    do {
      let currentT = 0;
      if (stripSize > 1) {
        currentT = huffman ? huffmanInput.readBits(logStripSize) :
          decodeInteger(contextCache, "IAIT", decoder) as number;
      }
      var t = stripSize * stripT + currentT;
      var symbolId = huffman ? huffmanTables.symbolIDTable.decode(huffmanInput) :
        decodeIAID(contextCache, decoder, symbolCodeLength);
      var applyRefinement = refinement && (huffman ? huffmanInput.readBit() :
        !!(decodeInteger(contextCache, "IARI", decoder)));
      var symbolBitmap = inputSymbols[symbolId];
      var symbolWidth = symbolBitmap[0].length;
      var symbolHeight = symbolBitmap.length;

      if (applyRefinement) {
        var rdw = decodeInteger(contextCache, "IARDW", decoder) as number;
        var rdh = decodeInteger(contextCache, "IARDH", decoder) as number;
        var rdx = decodeInteger(contextCache, "IARDX", decoder) as number;
        var rdy = decodeInteger(contextCache, "IARDY", decoder) as number;
        symbolWidth += rdw;
        symbolHeight += rdh;
        symbolBitmap = decodeRefinement(symbolWidth, symbolHeight,
          refinementTemplateIndex, symbolBitmap, (rdw >> 1) + rdx,
          (rdh >> 1) + rdy, false, refinementAt, decodingContext);
      }

      var offsetT = t - (referenceCorner & 1 ? 0 : symbolHeight - 1);
      var offsetS = currentS - (referenceCorner & 2 ? symbolWidth - 1 : 0);

      if (transposed) {
        for (var t2 = 0; t2 < symbolHeight; t2++) {
          if (!bitmap[offsetS + t2]) continue;
          var symRow = symbolBitmap[t2];
          var maxWidth = Math.min(width - offsetT, symbolWidth);
          for (var s2 = 0; s2 < maxWidth; s2++) {
            if (combinationOperator === 0) bitmap[offsetS + t2][offsetT + s2] |= symRow[s2];
            else if (combinationOperator === 2) bitmap[offsetS + t2][offsetT + s2] ^= symRow[s2];
            else throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
          }
        }
        currentS += symbolHeight - 1;
      } else {
        for (var t2 = 0; t2 < symbolHeight; t2++) {
          if (!bitmap[offsetT + t2]) continue;
          var symRow = symbolBitmap[t2];
          for (var s2 = 0; s2 < symbolWidth; s2++) {
            if (combinationOperator === 0) bitmap[offsetT + t2][offsetS + s2] |= symRow[s2];
            else if (combinationOperator === 2) bitmap[offsetT + t2][offsetS + s2] ^= symRow[s2];
            else throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
          }
        }
        currentS += symbolWidth - 1;
      }
      i++;
      var deltaS = huffman ? huffmanTables.tableDeltaS.decode(huffmanInput) :
        decodeInteger(contextCache, "IADS", decoder);
      if (deltaS === null) break;
      currentS += deltaS + dsOffset;
    } while (true);
  }
  return bitmap;
}

// ============ Pattern Dictionary ============
function decodePatternDictionary(
  mmr: boolean, patternWidth: number, patternHeight: number,
  maxPatternIndex: number, template: number, decodingContext: any
): Uint8Array[][] {
  const at: { x: number; y: number }[] = [];
  if (!mmr) {
    at.push({ x: -patternWidth, y: 0 });
    if (template === 0) {
      at.push({ x: -3, y: -1 }, { x: 2, y: -2 }, { x: -2, y: -2 });
    }
  }
  const collectiveWidth = (maxPatternIndex + 1) * patternWidth;
  const collectiveBitmap = decodeBitmap(mmr, collectiveWidth, patternHeight,
    template, false, null, at, decodingContext);
  const patterns: Uint8Array[][] = [];
  for (var i = 0; i <= maxPatternIndex; i++) {
    const sym = [];
    const xMin = patternWidth * i, xMax = xMin + patternWidth;
    for (var y = 0; y < patternHeight; y++) {
      sym.push(collectiveBitmap[y].subarray(xMin, xMax));
    }
    patterns.push(sym);
  }
  return patterns;
}

// ============ Halftone Region ============
function decodeHalftoneRegion(
  mmr: boolean, patterns: Uint8Array[][], template: number,
  regionWidth: number, regionHeight: number, defaultPixelValue: number,
  enableSkip: boolean, combinationOperator: number,
  gridWidth: number, gridHeight: number,
  gridOffsetX: number, gridOffsetY: number,
  gridVectorX: number, gridVectorY: number, decodingContext: any
): Uint8Array[] {
  if (enableSkip) throw new Jbig2Error("skip is not supported");
  if (combinationOperator !== 0) throw new Jbig2Error("operator not supported in halftone");

  const regionBitmap: Uint8Array[] = [];
  for (var i = 0; i < regionHeight; i++) {
    var row = new Uint8Array(regionWidth);
    if (defaultPixelValue) { for (var j = 0; j < regionWidth; j++) row[j] = defaultPixelValue; }
    regionBitmap.push(row);
  }

  const numberOfPatterns = patterns.length;
  const pattern0 = patterns[0];
  const patternWidth = pattern0[0].length, patternHeight = pattern0.length;
  const bitsPerValue = log2(numberOfPatterns);
  const at: { x: number; y: number }[] = [];
  if (!mmr) {
    at.push({ x: template <= 1 ? 3 : 2, y: -1 });
    if (template === 0) {
      at.push({ x: -3, y: -1 }, { x: 2, y: -2 }, { x: -2, y: -2 });
    }
  }

  const grayScaleBitPlanes: Uint8Array[][] = [];
  let mmrInput: any;
  if (mmr) mmrInput = new Reader(decodingContext.data, decodingContext.start, decodingContext.end);

  for (var i = bitsPerValue - 1; i >= 0; i--) {
    const bitmap = mmr ? decodeMMRBitmap(mmrInput, gridWidth, gridHeight, true) :
      decodeBitmap(false, gridWidth, gridHeight, template, false, null, at, decodingContext);
    grayScaleBitPlanes[i] = bitmap;
  }

  for (var mg = 0; mg < gridHeight; mg++) {
    for (var ng = 0; ng < gridWidth; ng++) {
      var bit = 0;
      var patternIndex = 0;
      for (var j = bitsPerValue - 1; j >= 0; j--) {
        bit = grayScaleBitPlanes[j][mg][ng] ^ bit;
        patternIndex |= bit << j;
      }
      var patternBitmap = patterns[patternIndex];
      var x = (gridOffsetX + mg * gridVectorY + ng * gridVectorX) >> 8;
      var y = (gridOffsetY + mg * gridVectorX - ng * gridVectorY) >> 8;

      if (x >= 0 && x + patternWidth <= regionWidth && y >= 0 && y + patternHeight <= regionHeight) {
        for (var i = 0; i < patternHeight; i++) {
          var regionRow = regionBitmap[y + i], patternRow = patternBitmap[i];
          for (var j = 0; j < patternWidth; j++) regionRow[x + j] |= patternRow[j];
        }
      } else {
        for (var i = 0; i < patternHeight; i++) {
          var regionY = y + i;
          if (regionY < 0 || regionY >= regionHeight) continue;
          regionRow = regionBitmap[regionY];
          patternRow = patternBitmap[i];
          for (var j = 0; j < patternWidth; j++) {
            var regionX = x + j;
            if (regionX >= 0 && regionX < regionWidth) regionRow[regionX] |= patternRow[j];
          }
        }
      }
    }
  }
  return regionBitmap;
}

// ============ Segment 处理 ============
function readSegmentHeader(data: Uint8Array, start: number): any {
  var segmentHeader: any = {};
  segmentHeader.number = readUint32(data, start);
  var flags = data[start + 4];
  var segmentType = flags & 0x3f;
  if (!SegmentTypes[segmentType]) throw new Jbig2Error("invalid segment type: " + segmentType);
  segmentHeader.type = segmentType;
  segmentHeader.typeName = SegmentTypes[segmentType];
  segmentHeader.deferredNonRetain = !!(flags & 0x80);
  var pageAssociationFieldSize = !!(flags & 0x40);
  var referredFlags = data[start + 5];
  var referredToCount = (referredFlags >> 5) & 7;
  var retainBits = [referredFlags & 31];
  var position = start + 6;
  if (referredFlags === 7) {
    referredToCount = readUint32(data, position - 1) & 0x1fffffff;
    position += 3;
    var bytes = (referredToCount + 7) >> 3;
    retainBits[0] = data[position++];
    while (--bytes > 0) retainBits.push(data[position++]);
  } else if (referredFlags === 5 || referredFlags === 6) {
    throw new Jbig2Error("invalid referred-to flags");
  }
  segmentHeader.retainBits = retainBits;

  let referredToSegmentNumberSize = 4;
  if (segmentHeader.number <= 256) referredToSegmentNumberSize = 1;
  else if (segmentHeader.number <= 65536) referredToSegmentNumberSize = 2;

  var referredTo: number[] = [];
  for (var i = 0; i < referredToCount; i++) {
    let number: number;
    if (referredToSegmentNumberSize === 1) number = data[position];
    else if (referredToSegmentNumberSize === 2) number = readUint16(data, position);
    else number = readUint32(data, position);
    referredTo.push(number);
    position += referredToSegmentNumberSize;
  }
  segmentHeader.referredTo = referredTo;
  segmentHeader.pageAssociation = pageAssociationFieldSize ? readUint32(data, position) : data[position];
  position += pageAssociationFieldSize ? 4 : 1;
  segmentHeader.length = readUint32(data, position);
  position += 4;

  if (segmentHeader.length === 0xffffffff) {
    if (segmentType === 38) {
      var genericRegionInfo = readRegionSegmentInformation(data, position);
      var genericRegionSegmentFlags = data[position + 17];
      var genericRegionMmr = !!(genericRegionSegmentFlags & 1);
      var searchPatternLength = 6;
      var searchPattern = new Uint8Array(searchPatternLength);
      if (!genericRegionMmr) { searchPattern[0] = 0xff; searchPattern[1] = 0xac; }
      searchPattern[2] = (genericRegionInfo.height >>> 24) & 0xff;
      searchPattern[3] = (genericRegionInfo.height >> 16) & 0xff;
      searchPattern[4] = (genericRegionInfo.height >> 8) & 0xff;
      searchPattern[5] = genericRegionInfo.height & 0xff;
      for (var i = position, ii = data.length; i < ii; i++) {
        var j = 0;
        while (j < searchPatternLength && searchPattern[j] === data[i + j]) j++;
        if (j === searchPatternLength) { segmentHeader.length = i + searchPatternLength; break; }
      }
      if (segmentHeader.length === 0xffffffff) throw new Jbig2Error("segment end not found");
    } else throw new Jbig2Error("invalid unknown segment length");
  }
  segmentHeader.headerEnd = position;
  return segmentHeader;
}

function readSegments(header: any, data: Uint8Array, start: number, end: number): any[] {
  var segments: any[] = [];
  var position = start;
  while (position < end) {
    var segmentHeader = readSegmentHeader(data, position);
    position = segmentHeader.headerEnd;
    var segment: any = { header: segmentHeader, data };
    if (!header.randomAccess) {
      segment.start = position;
      position += segmentHeader.length;
      segment.end = position;
    }
    segments.push(segment);
    if (segmentHeader.type === 51) break;
  }
  if (header.randomAccess) {
    for (var i = 0, ii = segments.length; i < ii; i++) {
      segments[i].start = position;
      position += segments[i].header.length;
      segments[i].end = position;
    }
  }
  return segments;
}

var RegionSegmentInformationFieldLength = 17;
function readRegionSegmentInformation(data: Uint8Array, start: number): any {
  return { width: readUint32(data, start), height: readUint32(data, start + 4),
    x: readUint32(data, start + 8), y: readUint32(data, start + 12),
    combinationOperator: data[start + 16] & 7 };
}

function processSegment(segment: any, visitor: any): void {
  var header = segment.header;
  var data = segment.data, position = segment.start, end = segment.end;
  var args: any[], at: { x: number; y: number }[], i: number;
  switch (header.type) {
    case 0: { // SymbolDictionary
      var dictionary: any = {};
      var dictionaryFlags = readUint16(data, position);
      dictionary.huffman = !!(dictionaryFlags & 1);
      dictionary.refinement = !!(dictionaryFlags & 2);
      dictionary.huffmanDHSelector = (dictionaryFlags >> 2) & 3;
      dictionary.huffmanDWSelector = (dictionaryFlags >> 4) & 3;
      dictionary.bitmapSizeSelector = (dictionaryFlags >> 6) & 1;
      dictionary.aggregationInstancesSelector = (dictionaryFlags >> 7) & 1;
      dictionary.bitmapCodingContextUsed = !!(dictionaryFlags & 256);
      dictionary.bitmapCodingContextRetained = !!(dictionaryFlags & 512);
      dictionary.template = (dictionaryFlags >> 10) & 3;
      dictionary.refinementTemplate = (dictionaryFlags >> 12) & 1;
      position += 2;
      if (!dictionary.huffman) {
        var atLength = dictionary.template === 0 ? 4 : 1;
        at = [];
        for (i = 0; i < atLength; i++) {
          at.push({ x: readInt8(data, position), y: readInt8(data, position + 1) });
          position += 2;
        }
        dictionary.at = at;
      }
      if (dictionary.refinement && !dictionary.refinementTemplate) {
        at = [];
        for (i = 0; i < 2; i++) {
          at.push({ x: readInt8(data, position), y: readInt8(data, position + 1) });
          position += 2;
        }
        dictionary.refinementAt = at;
      }
      dictionary.numberOfExportedSymbols = readUint32(data, position); position += 4;
      dictionary.numberOfNewSymbols = readUint32(data, position); position += 4;
      args = [dictionary, header.number, header.referredTo, data, position, end];
      break;
    }
    case 6: case 7: { // TextRegion
      var textRegion: any = {};
      textRegion.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      var textRegionSegmentFlags = readUint16(data, position); position += 2;
      textRegion.huffman = !!(textRegionSegmentFlags & 1);
      textRegion.refinement = !!(textRegionSegmentFlags & 2);
      textRegion.logStripSize = (textRegionSegmentFlags >> 2) & 3;
      textRegion.stripSize = 1 << textRegion.logStripSize;
      textRegion.referenceCorner = (textRegionSegmentFlags >> 4) & 3;
      textRegion.transposed = !!(textRegionSegmentFlags & 64);
      textRegion.combinationOperator = (textRegionSegmentFlags >> 7) & 3;
      textRegion.defaultPixelValue = (textRegionSegmentFlags >> 9) & 1;
      textRegion.dsOffset = (textRegionSegmentFlags << 17) >> 27;
      textRegion.refinementTemplate = (textRegionSegmentFlags >> 15) & 1;
      if (textRegion.huffman) {
        var hf = readUint16(data, position); position += 2;
        textRegion.huffmanFS = hf & 3;
        textRegion.huffmanDS = (hf >> 2) & 3;
        textRegion.huffmanDT = (hf >> 4) & 3;
        textRegion.huffmanRefinementDW = (hf >> 6) & 3;
        textRegion.huffmanRefinementDH = (hf >> 8) & 3;
        textRegion.huffmanRefinementDX = (hf >> 10) & 3;
        textRegion.huffmanRefinementDY = (hf >> 12) & 3;
        textRegion.huffmanRefinementSizeSelector = !!(hf & 0x4000);
      }
      if (textRegion.refinement && !textRegion.refinementTemplate) {
        at = [];
        for (i = 0; i < 2; i++) {
          at.push({ x: readInt8(data, position), y: readInt8(data, position + 1) });
          position += 2;
        }
        textRegion.refinementAt = at;
      }
      textRegion.numberOfSymbolInstances = readUint32(data, position); position += 4;
      args = [textRegion, header.referredTo, data, position, end];
      break;
    }
    case 16: { // PatternDictionary
      const pd: any = {};
      const pdf = data[position++];
      pd.mmr = !!(pdf & 1);
      pd.template = (pdf >> 1) & 3;
      pd.patternWidth = data[position++];
      pd.patternHeight = data[position++];
      pd.maxPatternIndex = readUint32(data, position); position += 4;
      args = [pd, header.number, data, position, end];
      break;
    }
    case 22: case 23: { // HalftoneRegion
      const hr: any = {};
      hr.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      const hrf = data[position++];
      hr.mmr = !!(hrf & 1);
      hr.template = (hrf >> 1) & 3;
      hr.enableSkip = !!(hrf & 8);
      hr.combinationOperator = (hrf >> 4) & 7;
      hr.defaultPixelValue = (hrf >> 7) & 1;
      hr.gridWidth = readUint32(data, position); position += 4;
      hr.gridHeight = readUint32(data, position); position += 4;
      hr.gridOffsetX = readUint32(data, position); position += 4;
      hr.gridOffsetY = readUint32(data, position); position += 4;
      hr.gridVectorX = readUint16(data, position); position += 2;
      hr.gridVectorY = readUint16(data, position); position += 2;
      args = [hr, header.referredTo, data, position, end];
      break;
    }
    case 38: case 39: { // GenericRegion
      var gr: any = {};
      gr.info = readRegionSegmentInformation(data, position);
      position += RegionSegmentInformationFieldLength;
      var grf = data[position++];
      gr.mmr = !!(grf & 1);
      gr.template = (grf >> 1) & 3;
      gr.prediction = !!(grf & 8);
      if (!gr.mmr) {
        var atLen = gr.template === 0 ? 4 : 1;
        at = [];
        for (i = 0; i < atLen; i++) {
          at.push({ x: readInt8(data, position), y: readInt8(data, position + 1) });
          position += 2;
        }
        gr.at = at;
      }
      args = [gr, data, position, end];
      break;
    }
    case 49: // EndOfPage
      break;
    case 50: // EndOfStripe
      break;
    case 51: // EndOfFile
      break;
    case 48: // PageInfo
      var pageInfo: any = {
        width: readUint32(data, position), height: readUint32(data, position + 4),
        resolutionX: readUint32(data, position + 8), resolutionY: readUint32(data, position + 12),
      };
      if (pageInfo.height === 0xffffffff) delete pageInfo.height;
      var pageSegmentFlags = data[position + 16];
      readUint16(data, position + 17); // pageStripingInformation
      pageInfo.lossless = !!(pageSegmentFlags & 1);
      pageInfo.refinement = !!(pageSegmentFlags & 2);
      pageInfo.defaultPixelValue = (pageSegmentFlags >> 2) & 1;
      pageInfo.combinationOperator = (pageSegmentFlags >> 3) & 3;
      pageInfo.requiresBuffer = !!(pageSegmentFlags & 32);
      pageInfo.combinationOperatorOverride = !!(pageSegmentFlags & 64);
      args = [pageInfo];
      break;
    case 53: // Tables
      args = [header.number, data, position, end];
      break;
    case 62: // 7.4.15 Extension types - comments, can be ignored.
      break;
    default:
      if (!SegmentTypes[header.type]) throw new Jbig2Error(`segment type ${header.type} not recognized`);
      return;
  }
  var callbackName = "on" + header.typeName;
  if (callbackName in visitor) visitor[callbackName].apply(visitor, args);
}

// ============ Reader ============
class Reader {
  data: Uint8Array;
  start: number;
  end: number;
  position: number;
  private shift: number;
  private currentByte: number;

  constructor(data: Uint8Array, start: number, end: number) {
    this.data = data;
    this.start = start;
    this.end = end;
    this.position = start;
    this.shift = -1;
    this.currentByte = 0;
  }

  readBit(): number {
    if (this.shift < 0) {
      if (this.position >= this.end) throw new Jbig2Error("end of data while reading bit");
      this.currentByte = this.data[this.position++];
      this.shift = 7;
    }
    return (this.currentByte >> this.shift--) & 1;
  }

  readBits(numBits: number): number {
    let result = 0;
    for (let i = numBits - 1; i >= 0; i--) result |= this.readBit() << i;
    return result;
  }

  byteAlign(): void {
    this.shift = -1;
  }

  next(): number {
    return this.position >= this.end ? -1 : this.data[this.position++];
  }
}

// ============ Huffman 表 ============
class HuffmanLine {
  isOOB: boolean;
  rangeLow: number;
  prefixLength: number;
  rangeLength: number;
  prefixCode: number;
  isLowerRange: boolean;

  constructor(lineData: (number | string)[]) {
    if (lineData.length === 2) {
      this.isOOB = true;
      this.rangeLow = 0;
      this.prefixLength = lineData[0] as number;
      this.rangeLength = 0;
      this.prefixCode = lineData[1] as number;
      this.isLowerRange = false;
    } else {
      this.isOOB = false;
      this.rangeLow = lineData[0] as number;
      this.prefixLength = lineData[1] as number;
      this.rangeLength = lineData[2] as number;
      this.prefixCode = lineData[3] as number;
      this.isLowerRange = lineData[4] === "lower";
    }
  }
}

class HuffmanTable {
  rootNode: HuffmanTreeNode;

  constructor(lines: HuffmanLine[], prefixCodesDone: boolean) {
    if (!prefixCodesDone) this.assignPrefixCodes(lines);
    this.rootNode = new HuffmanTreeNode(null);
    for (const line of lines) {
      if (line.prefixLength > 0) this.rootNode.buildTree(line, line.prefixLength - 1);
    }
  }

  decode(reader: Reader): number | null {
    return this.rootNode.decodeNode(reader);
  }

  private assignPrefixCodes(lines: HuffmanLine[]): void {
    const linesLength = lines.length;
    let prefixLengthMax = 0;
    for (const line of lines) {
      prefixLengthMax = Math.max(prefixLengthMax, line.prefixLength);
    }
    const histogram = new Uint32Array(prefixLengthMax + 1);
    for (const line of lines) histogram[line.prefixLength]++;
    let firstCode = 0;
    let currentLength = 1;
    histogram[0] = 0;
    while (currentLength <= prefixLengthMax) {
      firstCode = (firstCode + histogram[currentLength - 1]) << 1;
      let currentCode = firstCode;
      for (const line of lines) {
        if (line.prefixLength === currentLength) line.prefixCode = currentCode++;
      }
      currentLength++;
    }
  }
}

class HuffmanTreeNode {
  children: (HuffmanTreeNode | undefined)[];
  isLeaf: boolean;
  rangeLength: number;
  rangeLow: number;
  isLowerRange: boolean;
  isOOB: boolean;

  constructor(line: HuffmanLine | null) {
    this.children = [];
    if (line) {
      this.isLeaf = true;
      this.rangeLength = line.rangeLength;
      this.rangeLow = line.rangeLow;
      this.isLowerRange = line.isLowerRange;
      this.isOOB = line.isOOB;
    } else {
      this.isLeaf = false;
      this.rangeLength = 0;
      this.rangeLow = 0;
      this.isLowerRange = false;
      this.isOOB = false;
    }
  }

  buildTree(line: HuffmanLine, shift: number): void {
    const bit = (line.prefixCode >> shift) & 1;
    if (shift <= 0) {
      this.children[bit] = new HuffmanTreeNode(line);
    } else {
      if (!this.children[bit]) this.children[bit] = new HuffmanTreeNode(null);
      (this.children[bit] as HuffmanTreeNode).buildTree(line, shift - 1);
    }
  }

  decodeNode(reader: Reader): number | null {
    if (this.isLeaf) {
      if (this.isOOB) return null;
      return this.rangeLow + (this.isLowerRange ? -reader.readBits(this.rangeLength) : reader.readBits(this.rangeLength));
    }
    const node = this.children[reader.readBit()];
    if (!node) throw new Jbig2Error("invalid Huffman data");
    return node.decodeNode(reader);
  }
}

// ============ 标准 Huffman 表 ============
const standardTablesCache: Record<number, any> = {};
function getStandardTable(number: number): any {
  if (standardTablesCache[number]) return standardTablesCache[number];
  var lines: any[];
  switch (number) {
    case 1: lines = [[0, 1, 4, 0x0], [16, 2, 8, 0x2], [272, 3, 16, 0x6], [65808, 3, 32, 0x7]]; break;
    case 2: lines = [[0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xe], [11, 5, 6, 0x1e], [75, 6, 32, 0x3e], [6, 0x3f]]; break;
    case 3: lines = [[-256, 8, 8, 0xfe], [0, 1, 0, 0x0], [1, 2, 0, 0x2], [2, 3, 0, 0x6], [3, 4, 3, 0xe], [11, 5, 6, 0x1e], [-257, 8, 32, 0xff, "lower"], [75, 7, 32, 0x7e], [6, 0x3e]]; break;
    case 4: lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xe], [12, 5, 6, 0x1e], [76, 5, 32, 0x1f]]; break;
    case 5: lines = [[-255, 7, 8, 0x7e], [1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 0, 0x6], [4, 4, 3, 0xe], [12, 5, 6, 0x1e], [-256, 7, 32, 0x7f, "lower"], [76, 6, 32, 0x3e]]; break;
    case 6: lines = [[-2048, 5, 10, 0x1c], [-1024, 4, 9, 0x8], [-512, 4, 8, 0x9], [-256, 4, 7, 0xa], [-128, 5, 6, 0x1d], [-64, 5, 5, 0x1e], [-32, 4, 5, 0xb], [0, 2, 7, 0x0], [128, 3, 7, 0x2], [256, 3, 8, 0x3], [512, 4, 9, 0xc], [1024, 4, 10, 0xd], [-2049, 6, 32, 0x3e, "lower"], [2048, 6, 32, 0x3f]]; break;
    case 7: lines = [[-1024, 4, 9, 0x8], [-512, 3, 8, 0x0], [-256, 4, 7, 0x9], [-128, 5, 6, 0x1a], [-64, 5, 5, 0x1b], [-32, 4, 5, 0xa], [0, 4, 5, 0xb], [32, 5, 5, 0x1c], [64, 5, 6, 0x1d], [128, 4, 7, 0xc], [256, 3, 8, 0x1], [512, 3, 9, 0x2], [1024, 3, 10, 0x3], [-1025, 5, 32, 0x1e, "lower"], [2048, 5, 32, 0x1f]]; break;
    case 8: lines = [[-15, 8, 3, 0xfc], [-7, 9, 1, 0x1fc], [-5, 8, 1, 0xfd], [-3, 9, 0, 0x1fd], [-2, 7, 0, 0x7c], [-1, 4, 0, 0xa], [0, 2, 1, 0x0], [2, 5, 0, 0x1a], [3, 6, 0, 0x3a], [4, 3, 4, 0x4], [20, 6, 1, 0x3b], [22, 4, 4, 0xb], [38, 4, 5, 0xc], [70, 5, 6, 0x1b], [134, 5, 7, 0x1c], [262, 6, 7, 0x3c], [390, 7, 8, 0x7d], [646, 6, 10, 0x3d], [-16, 9, 32, 0x1fe, "lower"], [1670, 9, 32, 0x1ff], [2, 0x1]]; break;
    case 9: lines = [[-31, 8, 4, 0xfc], [-15, 9, 2, 0x1fc], [-11, 8, 2, 0xfd], [-7, 9, 1, 0x1fd], [-5, 7, 1, 0x7c], [-3, 4, 1, 0xa], [-1, 3, 1, 0x2], [1, 3, 1, 0x3], [3, 5, 1, 0x1a], [5, 6, 1, 0x3a], [7, 3, 5, 0x4], [39, 6, 2, 0x3b], [43, 4, 5, 0xb], [75, 4, 6, 0xc], [139, 5, 7, 0x1b], [267, 5, 8, 0x1c], [523, 6, 8, 0x3c], [779, 7, 9, 0x7d], [1291, 6, 11, 0x3d], [-32, 9, 32, 0x1fe, "lower"], [3339, 9, 32, 0x1ff], [2, 0x0]]; break;
    case 10: lines = [[-21, 7, 4, 0x7a], [-5, 8, 0, 0xfc], [-4, 7, 0, 0x7b], [-3, 5, 0, 0x18], [-2, 2, 2, 0x0], [2, 5, 0, 0x19], [3, 6, 0, 0x36], [4, 7, 0, 0x7c], [5, 8, 0, 0xfd], [6, 2, 6, 0x1], [70, 5, 5, 0x1a], [102, 6, 5, 0x37], [134, 6, 6, 0x38], [198, 6, 7, 0x39], [326, 6, 8, 0x3a], [582, 6, 9, 0x3b], [1094, 6, 10, 0x3c], [2118, 7, 11, 0x7d], [-22, 8, 32, 0xfe, "lower"], [4166, 8, 32, 0xff], [2, 0x2]]; break;
    case 11: lines = [[1, 1, 0, 0x0], [2, 2, 1, 0x2], [4, 4, 0, 0xc], [5, 4, 1, 0xd], [7, 5, 1, 0x1c], [9, 5, 2, 0x1d], [13, 6, 2, 0x3c], [17, 7, 2, 0x7a], [21, 7, 3, 0x7b], [29, 7, 4, 0x7c], [45, 7, 5, 0x7d], [77, 7, 6, 0x7e], [141, 7, 32, 0x7f]]; break;
    case 12: lines = [[1, 1, 0, 0x0], [2, 2, 0, 0x2], [3, 3, 1, 0x6], [5, 5, 0, 0x1c], [6, 5, 1, 0x1d], [8, 6, 1, 0x3c], [10, 7, 0, 0x7a], [11, 7, 1, 0x7b], [13, 7, 2, 0x7c], [17, 7, 3, 0x7d], [25, 7, 4, 0x7e], [41, 8, 5, 0xfe], [73, 8, 32, 0xff]]; break;
    case 13: lines = [[1, 1, 0, 0x0], [2, 3, 0, 0x4], [3, 4, 0, 0xc], [4, 5, 0, 0x1c], [5, 4, 1, 0xd], [7, 3, 3, 0x5], [15, 6, 1, 0x3a], [17, 6, 2, 0x3b], [21, 6, 3, 0x3c], [29, 6, 4, 0x3d], [45, 6, 5, 0x3e], [77, 7, 6, 0x7e], [141, 7, 32, 0x7f]]; break;
    case 14: lines = [[-2, 3, 0, 0x4], [-1, 3, 0, 0x5], [0, 1, 0, 0x0], [1, 3, 0, 0x6], [2, 3, 0, 0x7]]; break;
    case 15: lines = [[-24, 7, 4, 0x7c], [-8, 6, 2, 0x3c], [-4, 5, 1, 0x1c], [-2, 4, 0, 0xc], [-1, 3, 0, 0x4], [0, 1, 0, 0x0], [1, 3, 0, 0x5], [2, 4, 0, 0xd], [3, 5, 1, 0x1d], [5, 6, 2, 0x3d], [9, 7, 4, 0x7d], [-25, 7, 32, 0x7e, "lower"], [25, 7, 32, 0x7f]]; break;
    // ... additional tables would follow same pattern
    default: throw new Jbig2Error(`standard table B.${number} does not exist`);
  }
  for (var i = 0, ii = lines.length; i < ii; i++) lines[i] = new HuffmanLine(lines[i]);
  var table = new HuffmanTable(lines, true);
  standardTablesCache[number] = table;
  return table;
}

// ============ MMR 解码 ============
function decodeMMRBitmap(input: any, width: number, height: number, endOfBlock: boolean): Uint8Array[] {
  const params = { K: -1, Columns: width, Rows: height, BlackIs1: true, EndOfBlock: endOfBlock };
  const decoder = new (CCITTFaxDecoder as any)(input, params);
  const bitmap: Uint8Array[] = [];
  let currentByte = 0, eof = false;
  for (var y = 0; y < height; y++) {
    var row = new Uint8Array(width);
    bitmap.push(row);
    var shift = -1;
    for (var x = 0; x < width; x++) {
      if (shift < 0) {
        currentByte = decoder.readNextChar();
        if (currentByte === -1) { currentByte = 0; eof = true; }
        shift = 7;
      }
      row[x] = (currentByte >> shift) & 1;
      shift--;
    }
  }
  if (endOfBlock && !eof) {
    for (var i = 0; i < 5; i++) { if (decoder.readNextChar() === -1) break; }
  }
  return bitmap;
}

// ============ uncompress bitmap ============
function readUncompressedBitmap(reader: any, width: number, height: number): Uint8Array[] {
  const bitmap: Uint8Array[] = [];
  for (var y = 0; y < height; y++) {
    var row = new Uint8Array(width);
    bitmap.push(row);
    for (var x = 0; x < width; x++) row[x] = reader.readBit();
    reader.byteAlign();
  }
  return bitmap;
}

// ============ SimpleSegmentVisitor ============
class SimpleSegmentVisitor {
  currentPageInfo: any;
  buffer!: Uint8ClampedArray;
  symbols: Record<number, Uint8Array[][]> = {};
  patterns: Record<number, Uint8Array[][]> = {};
  customTables: Record<number, any> = {};

  onPageInformation(info: any): void {
    this.currentPageInfo = info;
    const rowSize = (info.width + 7) >> 3;
    const buffer = new Uint8ClampedArray(rowSize * info.height);
    if (info.defaultPixelValue) {
      for (let i = 0, ii = buffer.length; i < ii; i++) buffer[i] = 0xff;
    }
    this.buffer = buffer;
  }

  drawBitmap(regionInfo: any, bitmap: Uint8Array[]): void {
    const pageInfo = this.currentPageInfo;
    const width = regionInfo.width;
    const height = regionInfo.height;
    const rowSize = (pageInfo.width + 7) >> 3;
    const combinationOperator = pageInfo.combinationOperatorOverride
      ? regionInfo.combinationOperator
      : pageInfo.combinationOperator;
    const buffer = this.buffer;
    const mask0 = 128 >> (regionInfo.x & 7);
    let offset0 = regionInfo.y * rowSize + (regionInfo.x >> 3);
    for (let i = 0; i < height; i++) {
      let mask = mask0;
      let offset = offset0;
      for (let j = 0; j < width; j++) {
        if (bitmap[i][j]) {
          switch (combinationOperator) {
            case 0: // OR
              buffer[offset] |= mask;
              break;
            case 2: // XOR
              buffer[offset] ^= mask;
              break;
            default:
              throw new Jbig2Error(`operator ${combinationOperator} is not supported`);
          }
        }
        mask >>= 1;
        if (!mask) { mask = 128; offset++; }
      }
      offset0 += rowSize;
    }
  }

  onImmediateGenericRegion(region: any, data: Uint8Array, start: number, end: number): void {
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeBitmap(region.mmr, region.info.width, region.info.height,
      region.template, region.prediction, null, region.at, decodingContext);
    this.drawBitmap(region.info, bitmap);
  }

  onImmediateLosslessGenericRegion(...args: any[]): void {
    this.onImmediateGenericRegion(args[0], args[1], args[2], args[3]);
  }

  onSymbolDictionary(dictionary: any, currentSegment: number, referredSegments: number[],
    data: Uint8Array, start: number, end: number): void {
    let huffmanTables: any, huffmanInput: any;
    if (dictionary.huffman) {
      huffmanTables = getSymbolDictionaryHuffmanTables(dictionary, referredSegments, this.customTables);
      huffmanInput = new Reader(data, start, end);
    }
    if (!this.symbols) this.symbols = {};
    const symbols = this.symbols;
    let inputSymbols: Uint8Array[][] = [];
    for (const seg of referredSegments) {
      const ref = symbols[seg];
      if (ref) inputSymbols = inputSymbols.concat(ref);
    }
    const decodingContext = new DecodingContext(data, start, end);
    symbols[currentSegment] = decodeSymbolDictionary(dictionary.huffman, dictionary.refinement,
      inputSymbols, dictionary.numberOfNewSymbols, dictionary.numberOfExportedSymbols,
      huffmanTables, dictionary.template, dictionary.at, dictionary.refinementTemplate,
      dictionary.refinementAt, decodingContext, huffmanInput);
  }

  onImmediateTextRegion(region: any, referredSegments: number[], data: Uint8Array,
    start: number, end: number): void {
    const regionInfo = region.info;
    const symbols = this.symbols;
    let inputSymbols: Uint8Array[][] = [];
    for (const seg of referredSegments) {
      const ref = symbols[seg];
      if (ref) inputSymbols = inputSymbols.concat(ref);
    }
    const symbolCodeLength = log2(inputSymbols.length);
    let huffmanTables: any, huffmanInput: any;
    if (region.huffman) {
      huffmanInput = new Reader(data, start, end);
      huffmanTables = getTextRegionHuffmanTables(region, referredSegments, this.customTables,
        inputSymbols.length, huffmanInput);
    }
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeTextRegion(region.huffman, region.refinement, regionInfo.width, regionInfo.height,
      region.defaultPixelValue, region.numberOfSymbolInstances, region.stripSize, inputSymbols,
      symbolCodeLength, region.transposed, region.dsOffset, region.referenceCorner,
      region.combinationOperator, huffmanTables, region.refinementTemplate, region.refinementAt,
      decodingContext, region.logStripSize, huffmanInput);
    this.drawBitmap(regionInfo, bitmap);
  }

  onImmediateLosslessTextRegion(...args: any[]): void {
    this.onImmediateTextRegion(args[0], args[1], args[2], args[3], args[4]);
  }

  onPatternDictionary(dictionary: any, currentSegment: number, data: Uint8Array,
    start: number, end: number): void {
    if (!this.patterns) this.patterns = {};
    const decodingContext = new DecodingContext(data, start, end);
    this.patterns[currentSegment] = decodePatternDictionary(dictionary.mmr, dictionary.patternWidth,
      dictionary.patternHeight, dictionary.maxPatternIndex, dictionary.template, decodingContext);
  }

  onImmediateHalftoneRegion(region: any, referredSegments: number[], data: Uint8Array,
    start: number, end: number): void {
    const patterns = this.patterns[referredSegments[0]];
    const decodingContext = new DecodingContext(data, start, end);
    const bitmap = decodeHalftoneRegion(region.mmr, patterns, region.template, region.info.width,
      region.info.height, region.defaultPixelValue, region.enableSkip, region.combinationOperator,
      region.gridWidth, region.gridHeight, region.gridOffsetX, region.gridOffsetY,
      region.gridVectorX, region.gridVectorY, decodingContext);
    this.drawBitmap(region.info, bitmap);
  }

  onTables(currentSegment: number, data: Uint8Array, start: number, end: number): void {
    if (!this.customTables) this.customTables = {};
    this.customTables[currentSegment] = decodeTablesSegment(data, start, end);
  }
}

function getSymbolDictionaryHuffmanTables(dictionary: any, referredTo: number[], customTables: any): any {
  var tableDeltaHeight = dictionary.huffmanDHSelector === 0 || dictionary.huffmanDHSelector === 1 ?
    getStandardTable(dictionary.huffmanDHSelector + 4) :
    getCustomHuffmanTable(0, referredTo, customTables);
  var tableDeltaWidth = dictionary.huffmanDWSelector === 0 || dictionary.huffmanDWSelector === 1 ?
    getStandardTable(dictionary.huffmanDWSelector + 2) :
    getCustomHuffmanTable(dictionary.huffmanDWSelector === 3 ? 1 : 0, referredTo, customTables);
  var tableBitmapSize = dictionary.bitmapSizeSelector ? getCustomHuffmanTable(2, referredTo, customTables) : getStandardTable(1);
  var tableAggregateInstances = dictionary.aggregationInstancesSelector ? getCustomHuffmanTable(3, referredTo, customTables) : getStandardTable(1);
  return { tableDeltaHeight, tableDeltaWidth, tableBitmapSize, tableAggregateInstances };
}

function getTextRegionHuffmanTables(region: any, referredTo: number[], customTables: any, numberOfSymbols: number, reader: any): any {
  // Huffman table codes for symbol IDs (7.4.3.1.7)
  var codes = [];
  for (var i = 0; i <= 34; i++) codes.push(new HuffmanLine([i, reader.readBits(4), 0, 0]));
  var runCodesTable = new HuffmanTable(codes, false);
  codes.length = 0;
  for (var i = 0; i < numberOfSymbols;) {
    var codeLength = runCodesTable.decode(reader)!;
    if (codeLength! >= 32) {
      var numberOfRepeats: number = codeLength === 32 ? reader.readBits(2) + 3 : codeLength === 33 ? reader.readBits(3) + 3 : reader.readBits(7) + 11;
      var repeatedLength: number = codeLength === 32 ? (codes as any)[i - 1].prefixLength : 0;
      for (var j = 0; j < numberOfRepeats; j++) codes.push(new HuffmanLine([i++, repeatedLength, 0, 0]));
    } else { codes.push(new HuffmanLine([i++, codeLength, 0, 0])); }
  }
  reader.byteAlign();
  var symbolIDTable = new HuffmanTable(codes, false);
  // Table selection
  var ci = 0;
  var tableFirstS = region.huffmanFS < 2 ? getStandardTable(region.huffmanFS + 6) : getCustomHuffmanTable(ci++, referredTo, customTables);
  var tableDeltaS = region.huffmanDS < 3 ? getStandardTable(region.huffmanDS + 8) : getCustomHuffmanTable(ci++, referredTo, customTables);
  var tableDeltaT = region.huffmanDT < 3 ? getStandardTable(region.huffmanDT + 11) : getCustomHuffmanTable(ci++, referredTo, customTables);
  return { symbolIDTable, tableFirstS, tableDeltaS, tableDeltaT } as any;
}

function getCustomHuffmanTable(index: number, referredTo: number[], customTables: any): any {
  var currentIndex = 0;
  for (var i = 0, ii = referredTo.length; i < ii; i++) {
    var table = customTables[referredTo[i]];
    if (table) {
      if (index === currentIndex) return table;
      currentIndex++;
    }
  }
  throw new Jbig2Error("can't find custom Huffman table");
}

function decodeTablesSegment(data: Uint8Array, start: number, end: number): any {
  var flags = data[start];
  var lowestValue = readUint32(data, start + 1);
  var highestValue = readUint32(data, start + 5);
  var reader = new Reader(data, start + 9, end);
  var prefixSizeBits = ((flags >> 1) & 7) + 1;
  var rangeSizeBits = ((flags >> 4) & 7) + 1;
  var lines: any[] = [];
  var currentRangeLow = lowestValue;
  do {
    var prefixLength = reader.readBits(prefixSizeBits);
    var rangeLength = reader.readBits(rangeSizeBits);
    lines.push(new HuffmanLine([currentRangeLow, prefixLength, rangeLength, 0]));
    currentRangeLow += 1 << rangeLength;
  } while (currentRangeLow < highestValue);
  lines.push(new HuffmanLine([lowestValue - 1, reader.readBits(prefixSizeBits), 32, 0, "lower"]));
  lines.push(new HuffmanLine([highestValue, reader.readBits(prefixSizeBits), 32, 0]));
  if (flags & 1) lines.push(new HuffmanLine([reader.readBits(prefixSizeBits), 0]));
  return new HuffmanTable(lines, false);
}

// ============ 主解析函数 ============
function parseJbig2(data: Uint8Array): { imgData: Uint8ClampedArray; width: number; height: number } {
  const end = data.length;
  let position = 0;

  if (data[position] !== 0x97 || data[position + 1] !== 0x4a ||
    data[position + 2] !== 0x42 || data[position + 3] !== 0x32 ||
    data[position + 4] !== 0x0d || data[position + 5] !== 0x0a ||
    data[position + 6] !== 0x1a || data[position + 7] !== 0x0a) {
    throw new Jbig2Error("parseJbig2 - invalid header.");
  }

  position += 8;
  var flags = data[position++];
  var header: any = { randomAccess: !(flags & 1) };
  if (!(flags & 2)) { header.numberOfPages = readUint32(data, position); position += 4; }

  var segments = readSegments(header, data, position, end);
  var visitor = new SimpleSegmentVisitor();
  for (var i = 0, ii = segments.length; i < ii; i++) processSegment(segments[i], visitor);

  var { width, height } = visitor.currentPageInfo;
  var bitPacked = visitor.buffer;
  var imgData = new Uint8ClampedArray(width * height);
  var q = 0, k = 0;
  for (var i = 0; i < height; i++) {
    var mask = 0, buffer = 0;
    for (var j = 0; j < width; j++) {
      if (!mask) { mask = 128; buffer = bitPacked[k++]; }
      imgData[q++] = buffer & mask ? 0 : 255;
      mask >>= 1;
    }
  }
  return { imgData, width, height };
}

/**
 * Parse raw JBIG2 data chunks (with pre-parsed segments) into pixel data.
 * Used by Jbig2Stream when global segments (JBIG2Globals) need to be
 * fed before the main data.
 */
function parseJbig2Chunks(chunks: Array<{ data: Uint8Array; start: number; end: number }>): Uint8ClampedArray {
  const visitor = new SimpleSegmentVisitor();
  for (const chunk of chunks) {
    const segments = readSegments({}, chunk.data, chunk.start, chunk.end);
    for (const segment of segments) processSegment(segment, visitor);
  }
  return visitor.buffer;
}

// ============ 导出 ============
class Jbig2Image {
  width: number = 0;
  height: number = 0;

  parse(data: Uint8Array): Uint8ClampedArray {
    const { imgData, width, height } = parseJbig2(data);
    this.width = width;
    this.height = height;
    return imgData;
  }

  /** Parse one or more raw JBIG2 data chunks, returning packed pixel data. */
  parseChunks(chunks: Array<{ data: Uint8Array; start: number; end: number }>): Uint8ClampedArray {
    return parseJbig2Chunks(chunks);
  }
}

export { Jbig2Image };
