/**
 * OFD 电子签名验证工具
 *
 * 提供 OFD 文档电子签名的验证功能，支持：
 * - SM2/SM3 国密算法验证（GM/T 0003-2012、GM/T 0004-2012）
 * - SHA-1、MD5 传统算法验证
 * - SES 电子印章签名验证（GM/T 0031-2014）
 * - RSA 签名验证
 *
 * 参照标准：
 * - GM/T 0034-2014《基于SM2密码算法的证书认证系统证书格式》
 * - GM/T 0031-2014《安全电子签章密码应用规范》
 */

import { sm2, sm3 } from "sm-crypto";
import { sha1, md5, rsaVerifySHA1 } from "./crypto_util";
import { Uint8ArrayToHexString } from "./ofd_util";
import { Base64 } from "./asn1_util";

/**
 * 摘要计算并对比验证结果
 *
 * 根据指定的检查方法对文件数据进行哈希计算，并与提供的期望值对比
 * OFD 签名中的 References/CheckMethod 支持以下算法
 *
 * @param data - 原始文件数据
 * @param hashedBase64 - 期望的摘要值（Base64编码）
 * @param checkMethod - 哈希算法标识，支持：
 *   - SM3: 1.2.156.10197.1.401 或 "sm3"
 *   - MD5: "md5"
 *   - SHA1: "sha1"
 * @returns true 验证通过, false 验证失败, "" 未知算法
 */
export function digestByteArray(
  data: Uint8Array,
  hashedBase64: string,
  checkMethod: string
): boolean | string {
  const hashedHex = Uint8ArrayToHexString(new Uint8Array(Base64.decode(hashedBase64) as any));
  checkMethod = checkMethod.toLowerCase();
  if (checkMethod.indexOf("1.2.156.10197.1.401") >= 0 || checkMethod.indexOf("sm3") >= 0) {
    // sm-crypto sm3 accepts byte array input
    return hashedHex === sm3(Array.from(data));
  } else if (checkMethod.indexOf("md5") >= 0) {
    return hashedHex === md5(data);
  } else if (checkMethod.indexOf("sha1") >= 0) {
    return hashedHex === sha1(data);
  } else {
    return "";
  }
}

/**
 * SES 电子印章签名验证
 *
 * 对 SES 数字信封中 toSignDer 数据使用签名值进行验证
 * 验证算法支持 SM2（推荐）和 RSA
 *
 * @param SES_Signature - SES 签名数据结构
 * @returns true 验证通过, false 验证失败
 */
export function SES_Signature_Verify(SES_Signature: any): boolean {
  try {
    let signAlg = SES_Signature.realVersion < 4
      ? SES_Signature.toSign.signatureAlgorithm
      : SES_Signature.signatureAlgID;
    signAlg = signAlg.toLowerCase();
    const msg = SES_Signature.toSignDer;

    if (signAlg.indexOf("1.2.156.10197.1.501") >= 0 || signAlg.indexOf("1.2.156.10197.1.301") >= 0 || signAlg.indexOf("sm2") >= 0) {
      // SM2 签名验证（国密标准）
      let sigValueHex = SES_Signature.signature.replace(/ /g, '').replace(/\n/g, '');
      if (sigValueHex.indexOf('00') === 0) {
        sigValueHex = sigValueHex.substring(2, sigValueHex.length - 2);
      }
      const cert = SES_Signature.realVersion < 4
        ? SES_Signature.toSign.cert
        : SES_Signature.cert;
      let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g, '').replace(/\n/g, '');
      if (publicKey.indexOf('00') === 0) {
        publicKey = publicKey.substring(2, publicKey.length - 2);
      }
      return (sm2 as any).doVerifySignature(msg, sigValueHex, publicKey, {
        der: true,
        hash: true,
        userId: "1234567812345678",
      });
    } else {
      // RSA 签名验证（使用自实现 RSA PKCS#1 v1.5 + SHA1）
      const cert = SES_Signature.realVersion < 4
        ? SES_Signature.toSign.cert
        : SES_Signature.cert;
      let sigValueHex = SES_Signature.signature.replace(/ /g, '').replace(/\n/g, '');
      if (sigValueHex.indexOf('00') === 0) {
        sigValueHex = sigValueHex.substring(2, sigValueHex.length - 2);
      }
      let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g, '').replace(/\n/g, '');
      if (publicKey.indexOf('00') === 0) {
        publicKey = publicKey.substring(2, publicKey.length - 2);
      }
      return rsaVerifySHA1(Uint8ArrayToHexString(msg), sigValueHex, publicKey);
    }
  } catch (e) {
    console.log("SES_Signature_Verify fail:",e);
    return false;
  }
}
