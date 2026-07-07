/**
 * 轻量级 ASN.1 DER 解码工具
 *
 * 替代 @lapo/asn1js 的三个模块 (ASN1, Hex, Base64)，
 * 实现 SES 电子签名解析所需的 ASN.1 解码功能。
 *
 * 支持的 ASN.1 类型：
 * - Universal: INTEGER(0x02), BIT_STRING(0x03), OCTET_STRING(0x04),
 *   NULL(0x05), OID(0x06), UTF8String(0x0c), PrintableString(0x13),
 *   UTCTime(0x17), GeneralizedTime(0x18), SEQUENCE(0x30)
 * - Context-specific [0]..[4] (0xa0..0xa4)
 */

// ============================================================
// Hex 编解码
// ============================================================

export class Hex {
  static decode(a: string | number[]): Uint8Array {
    if (Array.isArray(a)) return new Uint8Array(a);
    const s = a.replace(/\s/g, '');
    const bytes = new Uint8Array(s.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(s.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}

// ============================================================
// Base64 编解码
// ============================================================

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP: { [key: string]: number } = {};
for (let i = 0; i < 64; i++) BASE64_LOOKUP[BASE64_CHARS[i]] = i;
BASE64_LOOKUP['='] = 0;
BASE64_LOOKUP['-'] = 62; // URL-safe
BASE64_LOOKUP['_'] = 63; // URL-safe

export class Base64 {
  static decode(a: string | number[]): Uint8Array {
    if (Array.isArray(a)) return new Uint8Array(a);
    return Base64._decode(a);
  }

  static unarmor(a: string): Uint8Array {
    // 移除 PEM 头尾
    let s = a.replace(/-----BEGIN[^-]*-----/g, '')
      .replace(/-----END[^-]*-----/g, '')
      .replace(/\s/g, '');
    return Base64._decode(s);
  }

  private static _decode(s: string): Uint8Array {
    // 计算实际字节数
    let padding = 0;
    if (s.endsWith('==')) padding = 2;
    else if (s.endsWith('=')) padding = 1;
    const byteLen = Math.floor(s.length / 4) * 3 - padding;
    const bytes = new Uint8Array(byteLen);
    let pos = 0;
    for (let i = 0; i < s.length; i += 4) {
      const c0 = BASE64_LOOKUP[s[i]] ?? 0;
      const c1 = BASE64_LOOKUP[s[i + 1]] ?? 0;
      const c2 = BASE64_LOOKUP[s[i + 2]] ?? 0;
      const c3 = BASE64_LOOKUP[s[i + 3]] ?? 0;
      const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
      if (pos < byteLen) bytes[pos++] = (triple >> 16) & 0xff;
      if (pos < byteLen) bytes[pos++] = (triple >> 8) & 0xff;
      if (pos < byteLen) bytes[pos++] = triple & 0xff;
    }
    return bytes;
  }
}

// ============================================================
// ASN.1 DER 标签常量
// ============================================================

const TAG_CLASS_UNIVERSAL = 0;
const TAG_CLASS_CONTEXT = 0x80; // Actually bit 7-8: 10 = context-specific

// Universal tag numbers
const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_OCTET_STRING = 0x04;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_UTF8String = 0x0c;
const TAG_PRINTABLE_STRING = 0x13;
const TAG_IA5_STRING = 0x16;
const TAG_UTCTime = 0x17;
const TAG_GENERALIZED_TIME = 0x18;
const TAG_SEQUENCE = 0x30;

const TYPE_NAMES: { [key: number]: string } = {
  0x02: 'INTEGER',
  0x03: 'BIT_STRING',
  0x04: 'OCTET_STRING',
  0x05: 'NULL',
  0x06: 'OBJECT_IDENTIFIER',
  0x0c: 'UTF8String',
  0x13: 'PrintableString',
  0x16: 'IA5String',
  0x17: 'UTCTime',
  0x18: 'GeneralizedTime',
  0x30: 'SEQUENCE',
};

// ============================================================
// Stream 类 (兼容 @lapo/asn1js Stream API)
// ============================================================

export class Stream {
  pos: number;
  header: number;
  length: number;
  enc: Uint8Array;

  constructor(enc: Uint8Array, pos?: number) {
    this.enc = enc;
    this.pos = pos ?? 0;
    this.header = 0;
    this.length = 0;
  }

  parseTime(start: number, end: number, shortYear?: boolean): string {
    const bytes = this.enc.slice(start, end);
    const str = String.fromCharCode(...bytes);
    if (shortYear === false) {
      // GeneralizedTime: "20260513232543Z"
      return str;
    }
    // UTCTime: "230915034358Z" or "Unrecognized time: ..."
    if (str.startsWith('Unrecognized')) {
      return str;
    }
    return str;
  }

  parseOctetString(start: number, end: number): Uint8Array {
    return this.enc.slice(start, end);
  }

  parseInteger(start: number, end: number): number {
    const bytes = this.enc.slice(start, end);
    let value = 0;
    const isNeg = bytes.length > 0 && (bytes[0] & 0x80) !== 0;
    if (isNeg) {
      // 处理负整数
      for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | (~bytes[i] & 0xff);
      }
      value = -(value + 1);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        value = (value << 8) | bytes[i];
      }
    }
    return value;
  }

  parseStringUTF(start: number, end: number): string {
    const bytes = this.enc.slice(start, end);
    return String.fromCharCode(...bytes);
  }

  parseOID(start: number, end: number): string {
    const bytes = this.enc.slice(start, end);
    if (bytes.length === 0) return '';
    // 第一个字节分解为 40*x + y
    let parts: number[] = [];
    const first = bytes[0];
    parts.push(Math.floor(first / 40));
    parts.push(first % 40);

    // 后续字节使用 VLQ 编码
    let current = 0;
    for (let i = 1; i < bytes.length; i++) {
      current = (current << 7) | (bytes[i] & 0x7f);
      if ((bytes[i] & 0x80) === 0) {
        parts.push(current);
        current = 0;
      }
    }
    return parts.join('.');
  }

  hexDump(start: number, end: number, compact?: boolean): string {
    const bytes = this.enc.slice(start, end);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    if (compact === false) {
      return hex.replace(/(..)/g, '$1 ').trim();
    }
    return hex;
  }
}

// ============================================================
// ASN1 节点类 (兼容 @lapo/asn1js ASN1 API)
// ============================================================

export class ASN1 {
  sub: ASN1[];
  stream: Stream;
  header: number;
  length: number;

  private _tag: number;
  private _tagClass: number;
  private _isConstructed: boolean;

  constructor(tag: number, stream: Stream, header: number, length: number, subs: ASN1[]) {
    this._tag = tag;
    this._tagClass = tag & 0xc0;
    this._isConstructed = (tag & 0x20) !== 0;
    this.stream = stream;
    this.header = header;
    this.length = length;
    this.sub = subs;
  }

  /**
   * DER 解码入口
   */
  static decode(data: Uint8Array | Stream, offset?: number): ASN1 {
    const stream = data instanceof Stream ? data : new Stream(data, offset ?? 0);
    return ASN1._decodeNode(stream, offset ?? 0);
  }

  /**
   * 获取类型名称
   */
  typeName(): string {
    const tagNum = this._tag & 0x1f;
    if ((this._tag & 0xc0) === 0x80) {
      // Context-specific: [n]
      return `[${tagNum}]`;
    }
    return TYPE_NAMES[this._tag] || `TAG:0x${this._tag.toString(16)}`;
  }

  /**
   * 获取内容字符串
   */
  content(): string {
    const start = this.stream.pos + this.header;
    const end = start + this.length;
    if (this._tag === TAG_OID) {
      return this.stream.parseOID(start, end);
    }
    return String.fromCharCode(...this.enc.slice(start, end));
  }

  get enc(): Uint8Array {
    return this.stream.enc;
  }

  /**
   * 递归解码一个 ASN.1 节点
   * 每个节点拥有自己独立的 Stream 实例
   */
  private static _decodeNode(stream: Stream, offset: number): ASN1 {
    const data = stream.enc;
    let pos = offset;

    // 读取 tag
    const tag = data[pos++];

    // 读取 length
    let length = data[pos++];
    let headerLen = 2; // tag + first length byte
    if (length & 0x80) {
      const numLenBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numLenBytes; i++) {
        length = (length << 8) | data[pos++];
      }
      headerLen = 2 + numLenBytes;
    }

    const valueStart = pos;
    const valueEnd = valueStart + length;

    // 创建该节点自己的 Stream，指向节点开头（tag 字节处）
    const nodeStream = new Stream(data, offset);
    nodeStream.header = headerLen;
    nodeStream.length = length;

    // 解析子节点
    let subs: ASN1[] = [];
    const isConstructed = (tag & 0x20) !== 0;
    const isSequenceLike = (tag === TAG_SEQUENCE) || isConstructed;

    if (isSequenceLike && length > 0) {
      let childPos = valueStart;
      while (childPos < valueEnd) {
        try {
          const child = ASN1._decodeNode(stream, childPos);
          subs.push(child);
          childPos = childPos + child.header + child.length;
        } catch {
          break;
        }
      }
    }

    return new ASN1(tag, nodeStream, headerLen, length, subs);
  }
}

/**
 * 从 Stream 或 Uint8Array 解码 ASN.1 并返回根节点
 */
export function decodeASN1(data: Uint8Array | Stream, offset?: number): ASN1 {
  return ASN1.decode(data, offset);
}
