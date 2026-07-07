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

/* eslint no-var: error */

import "./compatibility.js";

// Identity transformation matrix
export const IDENTITY_MATRIX: number[] = [1, 0, 0, 1, 0, 0];

// Font identity transformation matrix
export const FONT_IDENTITY_MATRIX: number[] = [0.001, 0, 0, 0.001, 0, 0];

/**
 * Permission flags from Table 22, Section 7.6.3.2 of the PDF specification.
 */
export const PermissionFlag = {
  PRINT: 0x04,
  MODIFY_CONTENTS: 0x08,
  COPY: 0x10,
  MODIFY_ANNOTATIONS: 0x20,
  FILL_INTERACTIVE_FORMS: 0x100,
  COPY_FOR_ACCESSIBILITY: 0x200,
  ASSEMBLE: 0x400,
  MODIFY_HIGH_QUALITY: 0x800,
};

/**
 * Text rendering mode constants.
 */
export const TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4,
};

/**
 * Image kind constants for different color formats.
 */
export const ImageKind = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3,
};

/**
 * Annotation type constants.
 */
export const AnnotationType = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26,
};

/**
 * Verbosity level for logging.
 */
export const VerbosityLevel = {
  ERRORS: 0,
  WARNINGS: 1,
  INFOS: 5,
};

/**
 * Base exception class for JBIG2 decoding errors.
 */
export abstract class BaseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class FormatError extends BaseException {}
export class PasswordException extends BaseException {
  code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.code = code;
  }
}

let verbosity = VerbosityLevel.WARNINGS;

export function setVerbosityLevel(level: number): void {
  if (Number.isInteger(level)) {
    verbosity = level;
  }
}

export function getVerbosityLevel(): number {
  return verbosity;
}

/**
 * Log information message if verbosity level allows it.
 */
export function info(msg: string): void {
  if (verbosity >= VerbosityLevel.INFOS) {
    console.log(`Info: ${msg}`);
  }
}

/**
 * Log warning message if verbosity level allows it.
 */
export function warn(msg: string): void {
  if (verbosity >= VerbosityLevel.WARNINGS) {
    console.log(`Warning: ${msg}`);
  }
}

/**
 * Throw an error for unreachable code path.
 */
export function unreachable(msg: string): never {
  throw new Error(msg);
}

/**
 * Assert that a condition is true.
 */
export function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) {
    unreachable(msg);
  }
}

/**
 * Shadow defines a property on an object with specific attributes.
 */
export function shadow<T>(obj: object, prop: string, value: T): T {
  Object.defineProperty(obj, prop, {
    value,
    enumerable: true,
    configurable: true,
    writable: false,
  });
  return value;
}

/**
 * Removes null characters from a string.
 */
export function removeNullCharacters(str: string): string {
  const NullCharactersRegExp = /\x00/g;
  return str.replace(NullCharactersRegExp, "");
}

/**
 * Converts a Uint8Array to a string.
 */
export function bytesToString(bytes: Uint8Array): string {
  assert(
    bytes !== null && typeof bytes === "object" && bytes.length !== undefined,
    "Invalid argument for bytesToString"
  );
  const length = bytes.length;
  const MAX_ARGUMENT_COUNT = 8192;
  const strBuf: string[] = [];
  for (let i = 0; i < length; i += MAX_ARGUMENT_COUNT) {
    const chunkEnd = Math.min(i + MAX_ARGUMENT_COUNT, length);
    const chunk = bytes.subarray(i, chunkEnd);
    strBuf.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return strBuf.join("");
}

/**
 * Converts a string to a Uint8Array.
 */
export function stringToBytes(str: string): Uint8Array {
  assert(typeof str === "string", "Invalid argument for stringToBytes");
  const length = str.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Gets length of the array (Array, Uint8Array, or string) in bytes.
 */
export function arrayByteLength(arr: Array<number> | Uint8Array | string): number {
  if (typeof arr === "string") {
    return arr.length;
  }
  if (arr.length !== undefined) {
    return arr.length;
  }
  assert((arr as Uint8Array).byteLength !== undefined, "arrayByteLength - invalid argument.");
  return (arr as Uint8Array).byteLength;
}

/**
 * Combines arrays items (arrays) into single Uint8Array object.
 */
export function arraysToBytes(arr: Array<Array<number> | Uint8Array | string>): Uint8Array {
  let resultLength = 0;
  for (const item of arr) {
    resultLength += arrayByteLength(item);
  }
  const data = new Uint8Array(resultLength);
  let pos = 0;
  for (const item of arr) {
    if (item instanceof Uint8Array) {
      data.set(item, pos);
      pos += item.length;
    } else if (Array.isArray(item)) {
      data.set(new Uint8Array(item), pos);
      pos += item.length;
    } else if (typeof item === "string") {
      const bytes = stringToBytes(item);
      data.set(bytes, pos);
      pos += bytes.length;
    }
  }
  return data;
}

/**
 * Checks if platform is little-endian.
 */
function isLittleEndian(): boolean {
  const buffer8 = new Uint8Array(4);
  buffer8[0] = 1;
  const view32 = new Uint32Array(buffer8.buffer, 0, 1);
  return view32[0] === 1;
}
const IsLittleEndianCached = {
  get value() {
    return shadow(this, "value", isLittleEndian());
  },
};

export { IsLittleEndianCached };

/**
 * Transforms a rectangle given an affine transformation, and finds the
 * minimum axis-aligned bounding box.
 */
export class Util {
  /**
   * Concatenates two transformation matrices together and returns the result.
   */
  static transform(m1: number[], m2: number[]): number[] {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[3] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
  }

  /**
   * For 2d affine transforms applies the transform to a point.
   */
  static applyTransform(p: number[], m: number[]): [number, number] {
    const xt = p[0] * m[0] + p[1] * m[2] + m[4];
    const yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  }

  /**
   * Applies the inverse transform to a point.
   */
  static applyInverseTransform(p: number[], m: number[]): [number, number] {
    const d = m[0] * m[3] - m[1] * m[2];
    const xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return [xt, yt];
  }

  /**
   * Applies the transform to the rectangle and finds the minimum axially
   * aligned bounding box.
   */
  static getAxialAlignedBoundingBox(
    r: number[],
    m: number[]
  ): [number, number, number, number] {
    const p1 = Util.applyTransform([r[0], r[1]], m);
    const p2 = Util.applyTransform(r.slice(2, 4) as [number, number], m);
    const p3 = Util.applyTransform([r[0], r[3]], m);
    const p4 = Util.applyTransform([r[2], r[1]], m);
    return [
      Math.min(p1[0], p2[0], p3[0], p4[0]),
      Math.min(p1[1], p2[1], p3[1], p4[1]),
      Math.max(p1[0], p2[0], p3[0], p4[0]),
      Math.max(p1[1], p2[1], p3[1], p4[1]),
    ];
  }

  /**
   * Compute the inverse of an affine transformation matrix.
   */
  static inverseTransform(m: number[]): number[] {
    const d = m[0] * m[3] - m[1] * m[2];
    return [
      m[3] / d,
      -m[1] /d,
      -m[2] /d,
      m[0] /d,
      (m[2] * m[5] - m[4] * m[3]) /d,
      (m[4] * m[1] - m[5] * m[0]) /d,
    ];
  }

  /**
   * Normalize rectangle so that (x1,y1) < (x2,y2)
   * For coordinate systems whose origin lies in the bottom-left, this
   * means normalization to (BL,TR) ordering. For systems with origin in the
   * top-left, this means (TL,BR) ordering.
   */
  static normalizeRect(rect: number[]): number[] {
    const r = rect.slice();
    if (rect[0] > rect[2]) {
      r[0] = rect[2];
      r[2] = rect[0];
    }
    if (rect[1] > rect[3]) {
      r[1] = rect[3];
      r[3] = rect[1];
    }
    return r;
  }

  /**
   * Returns the intersection of rectangles [x1, y1, x2, y2], null if no intersection.
   */
  static intersect(rect1: number[], rect2: number[]): number[] | null {
    function compare(a: number, b: number): number {
      return a - b;
    }

    const orderedX = [rect1[0], rect1[2], rect2[0], rect2[2]].sort(compare);
    const orderedY = [rect1[1], rect1[3], rect2[1], rect2[3]].sort(compare);
    const result: number[] = [];

    rect1 = Util.normalizeRect(rect1);
    rect2 = Util.normalizeRect(rect2);

    // X: first and second points belong to different rectangles?
    if (
      (orderedX[0] === rect1[0] && orderedX[1] === rect1[2]) ||
      (orderedX[0] === rect2[0] && orderedX[1] === rect2[2])
    ) {
      // Intersection must be between second and third points
      result[0] = orderedX[1];
      result[2] = orderedX[2];
    } else {
      return null;
    }

    // Y: first and second points belong to different rectangles?
    if (
      (orderedY[0] === rect1[1] && orderedY[1] === rect1[3]) ||
      (orderedY[0] === rect2[1] && orderedY[1] === rect2[3])
    ) {
      // Intersection must be between second and third points
      result[1] = orderedY[1];
      result[3] = orderedY[2];
    } else {
      return null;
    }

    return result;
  }

  static makeCssRgb(r: number, g: number, b: number): string {
    const rgbBuf = ["rgb(", 0, ",", 0, ",", 0, ")"];
    rgbBuf[1] = r;
    rgbBuf[3] = g;
    rgbBuf[5] = b;
    return rgbBuf.join("");
  }
}

// PDF character map translation table for converting PDF encoding to Unicode.
// prettier-ignore
const PDFStringTranslateTable: number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0x2D8, 0x2C7, 0x2C6, 0x2D9, 0x2DD, 0x2DB, 0x2DA, 0x2DC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x2022, 0x2020, 0x2021, 0x2026, 0x2014,
  0x192, 0x2044, 0x2039, 0x203A, 0x2212, 0x2030, 0x201E, 0x201C,
  0x201D, 0x2018, 0x2019, 0x201A, 0x2122, 0xFB01, 0xFB02, 0x141, 0x152, 0x160,
  0x178, 0x17D, 0x131, 0x142, 0x153, 0x161, 0x17E, 0, 0x20AC
];

/**
 * Convert a PDF string to a Unicode string based on the PDF character mapping table.
 */
export function stringToPDFString(str: string): string {
  const length = str.length;
  const strBuf: string[] = [];
  if (str[0] === "\xFE" && str[1] === "\xFF") {
    // UTF16BE BOM
    for (let i = 2; i < length; i += 2) {
      strBuf.push(
        String.fromCharCode((str.charCodeAt(i) << 8) | str.charCodeAt(i + 1))
      );
    }
  } else if (str[0] === "\xFF" && str[1] === "\xFE") {
    // UTF16LE BOM
    for (let i = 2; i < length; i += 2) {
      strBuf.push(
        String.fromCharCode((str.charCodeAt(i + 1) << 8) | str.charCodeAt(i))
      );
    }
  } else {
    for (let i = 0; i < length; i++) {
      const code = PDFStringTranslateTable[str.charCodeAt(i)];
      if (code) {
        strBuf.push(code ? String.fromCharCode(code) : str.charAt(i));
      } else {
        strBuf.push(str.charAt(i));
      }
    }
  }
  return strBuf.join("");
}

export function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export function isNum(v: unknown): v is number {
  return typeof v === "number";
}

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isArrayBuffer(v: unknown): v is ArrayBuffer | Uint8Array {
  return typeof v === "object" && v !== null && (v as {byteLength?: number}).byteLength !== undefined;
}

export function isArrayEqual(arr1: unknown[], arr2: unknown[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  return arr1.every(function (element, index) {
    return element === arr2[index];
  });
}
