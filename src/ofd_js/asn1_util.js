/**
 * 轻量级 ASN.1 DER 解码工具 (JS 版本)
 *
 * 替代 @lapo/asn1js 的三个模块 (ASN1, Hex, Base64)，
 * 用于 SES 电子签名解析。
 */

// ============================================================
// Hex 编解码
// ============================================================

export class Hex {
  static decode(a) {
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
const BASE64_LOOKUP = {};
for (let i = 0; i < 64; i++) BASE64_LOOKUP[BASE64_CHARS[i]] = i;
BASE64_LOOKUP['='] = 0;

export class Base64 {
  static decode(a) {
    if (Array.isArray(a)) return new Uint8Array(a);
    return Base64._decode(a);
  }

  static unarmor(a) {
    let s = a.replace(/-----BEGIN[^-]*-----/g, '')
      .replace(/-----END[^-]*-----/g, '')
      .replace(/\s/g, '');
    return Base64._decode(s);
  }

  static _decode(s) {
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
// ASN.1 标签常量
// ============================================================

const TAG_SEQUENCE = 0x30;

const TYPE_NAMES = {
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
// Stream 类
// ============================================================

export class Stream {
  constructor(enc, pos) {
    this.enc = enc;
    this.pos = pos ?? 0;
    this.header = 0;
    this.length = 0;
  }

  parseTime(start, end, shortYear) {
    const bytes = this.enc.slice(start, end);
    const str = String.fromCharCode(...bytes);
    if (shortYear === false) return str;
    return str;
  }

  parseOctetString(start, end) {
    return this.enc.slice(start, end);
  }

  parseInteger(start, end) {
    const bytes = this.enc.slice(start, end);
    let value = 0;
    const isNeg = bytes.length > 0 && (bytes[0] & 0x80) !== 0;
    if (isNeg) {
      for (let i = 0; i < bytes.length; i++) value = (value << 8) | (~bytes[i] & 0xff);
      value = -(value + 1);
    } else {
      for (let i = 0; i < bytes.length; i++) value = (value << 8) | bytes[i];
    }
    return value;
  }

  parseStringUTF(start, end) {
    const bytes = this.enc.slice(start, end);
    return String.fromCharCode(...bytes);
  }

  parseOID(start, end) {
    const bytes = this.enc.slice(start, end);
    if (bytes.length === 0) return '';
    let parts = [];
    const first = bytes[0];
    parts.push(Math.floor(first / 40));
    parts.push(first % 40);
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

  hexDump(start, end, compact) {
    const bytes = this.enc.slice(start, end);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    if (compact === false) return hex.replace(/(..)/g, '$1 ').trim();
    return hex;
  }
}

// ============================================================
// ASN1 节点类
// ============================================================

export class ASN1 {
  constructor(tag, stream, header, length, subs) {
    this._tag = tag;
    this.stream = stream;
    this.header = header;
    this.length = length;
    this.sub = subs;
  }

  static decode(data, offset) {
    const stream = data instanceof Stream ? data : new Stream(data, offset ?? 0);
    return ASN1._decodeNode(stream, offset ?? 0);
  }

  typeName() {
    const tagNum = this._tag & 0x1f;
    if ((this._tag & 0xc0) === 0x80) return `[${tagNum}]`;
    return TYPE_NAMES[this._tag] || `TAG:0x${this._tag.toString(16)}`;
  }

  content() {
    const start = this.stream.pos + this.header;
    const end = start + this.length;
    if ((this._tag & 0x1f) === 0x06) return this.stream.parseOID(start, end);
    return String.fromCharCode(...this.enc.slice(start, end));
  }

  get enc() { return this.stream.enc; }

  static _decodeNode(stream, offset) {
    const data = stream.enc;
    let pos = offset;
    const tag = data[pos++];
    let length = data[pos++];
    let headerLen = 2;
    if (length & 0x80) {
      const numLenBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numLenBytes; i++) length = (length << 8) | data[pos++];
      headerLen = 2 + numLenBytes;
    }
    const valueStart = pos;
    const valueEnd = valueStart + length;
    const isConstructed = (tag & 0x20) !== 0;
    const isSequenceLike = (tag === TAG_SEQUENCE) || isConstructed;

    // 每个节点拥有自己独立的 Stream
    const nodeStream = new Stream(data, offset);
    nodeStream.header = headerLen;
    nodeStream.length = length;

    let subs = [];
    if (isSequenceLike && length > 0) {
      let childPos = valueStart;
      while (childPos < valueEnd) {
        try {
          const child = ASN1._decodeNode(stream, childPos);
          subs.push(child);
          childPos = childPos + child.header + child.length;
        } catch { break; }
      }
    }

    return new ASN1(tag, nodeStream, headerLen, length, subs);
    stream.pos = offset;
    stream.header = headerLen;
    stream.length = length;
    return node;
  }
}

export function decodeASN1(data, offset) {
  return ASN1.decode(data, offset);
}
