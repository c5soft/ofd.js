/**
 * 轻量级密码学工具库
 *
 * 自实现 SHA1、MD5 哈希算法和 RSA PKCS#1 v1.5 签名验证，
 * 用于替代 js-md5、js-sha1、jsrsasign 三个外部依赖。
 */

// ============================================================
// SHA-1 实现 (FIPS 180-4)
// ============================================================

/**
 * SHA-1 哈希计算
 * @param {Uint8Array} data - 输入字节数组
 * @returns {string} 40 字符小写 hex 字符串
 */
export function sha1(data) {
  const bitLen = data.length * 8;
  const padLen = (data.length + 72) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let offset = 0; offset < padLen; offset += 64) {
    const W = new Uint32Array(80);
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(offset + t * 4, false);
    for (let t = 16; t < 80; t++) W[t] = rotl(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);

    let a = H0, b = H1, c = H2, d = H3, e = H4;
    for (let t = 0; t < 80; t++) {
      let f, k;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (rotl(a, 5) + f + e + k + W[t]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }
    H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0; H4 = (H4 + e) >>> 0;
  }
  const hex = n => n.toString(16).padStart(8, '0');
  return hex(H0) + hex(H1) + hex(H2) + hex(H3) + hex(H4);
}

// ============================================================
// MD5 实现 (RFC 1321)
// ============================================================

/**
 * MD5 哈希计算
 * @param {Uint8Array} data - 输入字节数组
 * @returns {string} 32 字符小写 hex 字符串
 */
export function md5(data) {
  const bitLen = data.length * 8;
  const padLen = (data.length + 72) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, bitLen >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);

  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const T = new Uint32Array(64);
  for (let i = 0; i < 64; i++) T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;

  for (let offset = 0; offset < padLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + T[i] + M[g]) >>> 0;
      A = D; D = C; C = B; B = (B + rotl(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const le = n => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  };
  return le(a0) + le(b0) + le(c0) + le(d0);
}

// ============================================================
// RSA PKCS#1 v1.5 签名验证
// ============================================================

const SHA1_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e,
  0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
]);

function parseRSAPublicKey(derBytes) {
  let pos = 0;
  if (derBytes[pos++] !== 0x30) throw new Error('RSAPublicKey: expected SEQUENCE');
  if (derBytes[pos] & 0x80) {
    pos += (derBytes[pos] & 0x7f) + 1;
  } else {
    pos++;
  }
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
 * @param {string} msgHex - 消息 hex
 * @param {string} sigHex - 签名 hex
 * @param {string} pubKeyHex - SubjectPublicKey hex (含 unused-bits 前缀)
 * @returns {boolean}
 */
export function rsaVerifySHA1(msgHex, sigHex, pubKeyHex) {
  try {
    const msgBytes = hexToBytes(msgHex);
    const hash = sha1(msgBytes);
    const hashBytes = hexToBytes(hash);
    const digestInfo = new Uint8Array(SHA1_DIGEST_INFO_PREFIX.length + hashBytes.length);
    digestInfo.set(SHA1_DIGEST_INFO_PREFIX);
    digestInfo.set(hashBytes, SHA1_DIGEST_INFO_PREFIX.length);

    const keyBytes = hexToBytes(pubKeyHex);
    const rsaKeyDer = keyBytes.slice(1);
    const [n, e] = parseRSAPublicKey(rsaKeyDer);

    const s = BigInt('0x' + sigHex);
    const m = modPow(s, e, n);
    const modLen = Math.ceil(n.toString(16).length / 2);
    let mHex = m.toString(16).padStart(modLen * 2, '0');
    const mBytes = hexToBytes(mHex);

    if (mBytes.length < 11) return false;
    if (mBytes[0] !== 0x00 || mBytes[1] !== 0x01) return false;
    let sep = 2;
    while (sep < mBytes.length && mBytes[sep] === 0xff) sep++;
    if (sep >= mBytes.length || mBytes[sep] !== 0x00) return false;
    sep++;
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

function hexToBytes(hex) {
  const h = hex.replace(/\s/g, '');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function modPow(base, exp, mod) {
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
