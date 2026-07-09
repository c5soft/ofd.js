/**
 * 轻量级密码学工具库
 *
 * 自实现 SHA1、MD5 哈希算法和 RSA PKCS#1 v1.5 签名验证，
 * 用于替代 js-md5、js-sha1、jsrsasign 三个外部依赖。
 *
 * 参照标准：
 * - FIPS 180-4 (SHA-1)
 * - RFC 1321 (MD5)
 * - PKCS#1 v2.2 (RSA 签名验证)
 */

// ============================================================
// SHA-1 实现 (FIPS 180-4)
// ============================================================

/**
 * SHA-1 哈希计算
 * @param data - 输入字节数组
 * @returns 40 字符小写 hex 字符串
 */
export function sha1(data: Uint8Array): string {
  // 预处理：追加 0x80 和长度（大端 64 位）
  const bitLen = data.length * 8;
  // 补位后总长度必须是 512 位的倍数：0x80 + 填充 0 + 8 字节长度
  // padLen = 向上取整到 64 的最小值，满足 (data.length + 1 + zeros + 8) ≡ 0 (mod 64)
  const padLen = (data.length + 72) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  // 最后 8 字节为原始 bit 长度（大端）
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  // 初始化哈希值
  let H0 = 0x67452301;
  let H1 = 0xEFCDAB89;
  let H2 = 0x98BADCFE;
  let H3 = 0x10325476;
  let H4 = 0xC3D2E1F0;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  // 每 64 字节（512 位）处理一块
  for (let offset = 0; offset < padLen; offset += 64) {
    const W = new Uint32Array(80);
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 80; t++) {
      W[t] = rotl(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
    }

    let a = H0, b = H1, c = H2, d = H3, e = H4;

    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      const temp = (rotl(a, 5) + f + e + k + W[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    H0 = (H0 + a) >>> 0;
    H1 = (H1 + b) >>> 0;
    H2 = (H2 + c) >>> 0;
    H3 = (H3 + d) >>> 0;
    H4 = (H4 + e) >>> 0;
  }

  // 输出 hex
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return hex(H0) + hex(H1) + hex(H2) + hex(H3) + hex(H4);
}

// ============================================================
// MD5 实现 (RFC 1321)
// ============================================================

/**
 * MD5 哈希计算
 * @param data - 输入字节数组
 * @returns 32 字符小写 hex 字符串
 */
export function md5(data: Uint8Array): string {
  const bitLen = data.length * 8;
  const padLen = (data.length + 72) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  // MD5 以小端存储长度
  view.setUint32(padLen - 8, bitLen >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);

  // MD5 移位宏
  const S: number[] = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const T = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;

  for (let offset = 0; offset < padLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = view.getUint32(offset + i * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + T[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const le = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  };
  return le(a0) + le(b0) + le(c0) + le(d0);
}

// ============================================================
// RSA PKCS#1 v1.5 签名验证
// ============================================================

/**
 * SHA-1 的 DER 编码 DigestInfo OID + 固定头
 * DER: 30 21 30 09 06 05 2b 0e 03 02 1a 05 00 04 14
 */
const SHA1_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e,
  0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
]);

/**
 * 从 DER 编码的 RSAPublicKey 中提取模数 n 和公钥指数 e
 *
 * RSAPublicKey ::= SEQUENCE {
 *   modulus           INTEGER,  -- n
 *   publicExponent    INTEGER   -- e
 * }
 *
 * @param derBytes - DER 编码的 RSAPublicKey
 * @returns [n, e] 大整数
 */
function parseRSAPublicKey(derBytes: Uint8Array): [bigint, bigint] {
  // 跳过 SEQUENCE 头 (tag + length)
  let pos = 0;
  if (derBytes[pos++] !== 0x30) throw new Error('RSAPublicKey: expected SEQUENCE');
  // 跳过 length（可能 1-2 字节）
  if (derBytes[pos] & 0x80) {
    pos += (derBytes[pos] & 0x7f) + 1;
  } else {
    pos++;
  }

  // 解析第一个 INTEGER (n)
  if (derBytes[pos++] !== 0x02) throw new Error('RSAPublicKey: expected INTEGER for modulus');
  let len = derBytes[pos++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) len = (len << 8) | derBytes[pos++];
  }
  const nBytes = derBytes.slice(pos, pos + len);
  pos += len;
  const n = BigInt('0x' + Array.from(nBytes).map(b => b.toString(16).padStart(2, '0')).join(''));

  // 解析第二个 INTEGER (e)
  if (derBytes[pos++] !== 0x02) throw new Error('RSAPublicKey: expected INTEGER for exponent');
  len = derBytes[pos++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < numBytes; i++) len = (len << 8) | derBytes[pos++];
  }
  const eBytes = derBytes.slice(pos, pos + len);
  const e = BigInt('0x' + Array.from(eBytes).map(b => b.toString(16).padStart(2, '0')).join(''));

  return [n, e];
}

/**
 * RSA PKCS#1 v1.5 + SHA1 签名验证
 *
 * @param msgHex - 消息的 hex 编码
 * @param sigHex - 签名的 hex 编码
 * @param pubKeyHex - SubjectPublicKey BIT STRING 内容的 hex 编码
 *   （从 subjectPublicKeyInfo.subjectPublicKey 获取，
 *    包含前导 00 未使用位字节 + DER 编码的 RSAPublicKey）
 * @returns true 验证通过，false 验证失败
 */
export function rsaVerifySHA1(msgHex: string, sigHex: string, pubKeyHex: string): boolean {
  try {
    // 1. 计算 SHA1 哈希
    const msgBytes = hexToBytes(msgHex);
    const hash = sha1(msgBytes);

    // 2. 构造 DigestInfo DER
    const hashBytes = hexToBytes(hash);
    const digestInfo = new Uint8Array(SHA1_DIGEST_INFO_PREFIX.length + hashBytes.length);
    digestInfo.set(SHA1_DIGEST_INFO_PREFIX);
    digestInfo.set(hashBytes, SHA1_DIGEST_INFO_PREFIX.length);

    // 3. 解析 RSA 公钥
    // pubKeyHex 格式: "00" (unused bits) + DER RSAPublicKey
    const keyBytes = hexToBytes(pubKeyHex);
    // 跳过第一个字节（BIT STRING 的 unused bits 标记）
    const rsaKeyDer = keyBytes.slice(1);
    const [n, e] = parseRSAPublicKey(rsaKeyDer);

    // 4. 解码签名值
    const sigBytes = hexToBytes(sigHex);
    // 签名值可能以 00 开头
    const s = BigInt('0x' + sigHex);

    // 5. 模幂运算恢复签名消息
    const m = modPow(s, e, n);

    // 6. 将 m 转换为 modLen 字节
    const modLen = Math.ceil(Number(n.toString(16).length) / 2);
    let mHex = m.toString(16).padStart(modLen * 2, '0');

    // 7. PKCS#1 v1.5 验证
    // 预期格式: 00 01 FF...FF 00 DigestInfo
    const mBytes = hexToBytes(mHex);
    if (mBytes.length < 11) return false;
    if (mBytes[0] !== 0x00 || mBytes[1] !== 0x01) return false;

    // 查找分隔符 0x00
    let sep = 2;
    while (sep < mBytes.length && mBytes[sep] === 0xff) sep++;
    if (sep >= mBytes.length || mBytes[sep] !== 0x00) return false;
    sep++; // skip 0x00

    // 比较 DigestInfo
    const recoveredDI = mBytes.slice(sep);
    if (recoveredDI.length !== digestInfo.length) return false;
    for (let i = 0; i < digestInfo.length; i++) {
      if (recoveredDI[i] !== digestInfo[i]) return false;
    }
    return true;
  } catch (e) {
    console.log("rsaVerifySHA1 error:", e);
    return false;
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * hex 字符串转 Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/\s/g, '');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * 大整数模幂运算 (base^exp mod mod)
 * 使用平方-乘算法
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % mod;
    e >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}
