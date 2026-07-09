/**
 * SES 电子签名解析器
 *
 * 解析 OFD 文档中的 SES（Signature Electronic Seal）数字信封。
 * SES 遵循 GM/T 0031-2014《安全电子签章密码应用规范》。
 *
 * SES 数字信封结构：
 * - DER 编码的 ASN.1 数据
 * - 包含电子印章信息（印章图片、印章ID、有效期等）
 * - 包含签名值数据
 *
 * 支持 SES V1 和 SES V4 两种版本格式。
 */

import { Hex, Base64, ASN1 } from "./asn1_util";
import { SES_Signature_Verify, digestByteArray } from "./verify_signature_util";
import type { SES_Signature } from "./verify_signature_util";

let reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;

/** SES 签章解码结果 */
export interface DecodedSeal {
  ofdArray: Uint8Array | null;
  type: string | null;
  SES_Signature: SES_Signature;
  verifyRet: boolean;
}

/** X.509 证书解码结果 */
interface DecodedCert {
  subject: Map<string, string>;
  commonName?: string;
  subjectPublicKeyInfo: {
    algorithm?: string;
    subjectPublicKey: string;
  };
}

/**
 * 从 ZIP 文件中解析 SES 签名数据
 * @param zip - JSZip 实例
 * @param name - 签章文件名
 * @returns 解析后的签章对象
 */
export async function parseSesSignature(zip: any, name: string): Promise<DecodedSeal> {
  return new Promise((resolve, reject) => {
    zip.files[name].async('base64').then(function (bytes: string) {
      let res = decodeText(bytes);
      resolve(res);
    }, function error(e: Error) {
      reject(e);
    });
  });
}

/**
 * 摘要检查处理
 * @param arr - 待检查的文件数据数组
 * @returns true 全部通过
 */
export function digestCheckProcess(arr: Array<{ fileData: Uint8Array; hashed: string; checkMethod: string }>): boolean {
  let ret = true;
  for (const val of arr) {
    const value = digestByteArray(val.fileData, val.hashed, val.checkMethod);
    ret = ret && (value === true);
  }
  return ret;
}

/**
 * 解码 SES 签名数据，从 Base64/Hex 解码为 ASN.1 结构
 * @param val - Base64 或 Hex 编码的签名数据
 * @returns 解码后的签章对象
 */
function decodeText(val: string): DecodedSeal {
  try {
    let der = reHex.test(val) ? Hex.decode(val) : Base64.unarmor(val);
    let res = decode(der);
    return res;
  } catch (e) {
    console.log(e);
    return { ofdArray: null, type: null, SES_Signature: {} as any, verifyRet: false };
  }
}

/**
 * ASN.1 DER 解码入口
 * @param der - DER 编码的字节数组
 * @param offset - 偏移量
 * @returns 解码后的签章对象
 */
function decode(der: Uint8Array, offset?: number): DecodedSeal {
  offset = offset || 0;
  try {
    const SES_Signature = decodeSES_Signature(der, offset);
    if (SES_Signature.toSign && SES_Signature.toSign.eseal) {
      // SES 格式：包含电子印章信息
      const type = SES_Signature.toSign.eseal.esealInfo.picture.type;
      const ofdArray = SES_Signature.toSign.eseal.esealInfo.picture.data.byte;
      return {
        ofdArray,
        'type': (type.str || type).toLowerCase(),
        SES_Signature,
        'verifyRet': SES_Signature_Verify(SES_Signature),
      };
    }
    // CMS 格式：不含 eseal，仅返回验证结果
    return {
      ofdArray: null,
      'type': null,
      SES_Signature,
      'verifyRet': SES_Signature_Verify(SES_Signature),
    };
  } catch (_e) {
    console.log(_e);
    return { ofdArray: null, type: null, SES_Signature: {} as any, verifyRet: false };
  }
}

/**
 * 解析 UTCTime 格式的时间字符串
 * @param str - 时间字符串
 * @returns 格式化后的时间字符串
 */
function decodeUTCTime(str: string): string {
  str = str.replace('Unrecognized time: ', '');
  str = str.replace('Z', '');
  str = str.substring(0, 1) < '5' ? '20' + str : '19' + str;
  return str;
}

/**
 * 解码 SES 签名 ASN.1 结构，支持 V1、V4 和 CMS ContentInfo 三种格式
 *
 * SES V1 结构（早期版本）：
 *   SEQUENCE {
 *     toSign SEQUENCE { ... },
 *     signature BIT STRING
 *   }
 *
 * SES V4 结构（当前标准版本）：
 *   SEQUENCE {
 *     toSign SEQUENCE { ... },
 *     cert SEQUENCE { ... },
 *     signatureAlgID OID,
 *     signature BIT STRING,
 *     timeStamp UTCTime
 *   }
 *
 * CMS ContentInfo 格式 (GM/T 0006)：
 *   SEQUENCE {
 *     contentType OID,       -- 1.2.156.10197.6.1.4.2.2 (signedData)
 *     [0] {
 *       SEQUENCE {           -- SignedData
 *         version INTEGER,
 *         digestAlgorithms SET,
 *         encapContentInfo SEQUENCE,
 *         certificates [0] IMPLICIT,
 *         signerInfos SET
 *       }
 *     }
 *   }
 *
 * @param der - DER 编码数据
 * @param offset - 偏移量
 * @returns SES 签名对象
 */
function decodeSES_Signature(der: Uint8Array, offset?: number): SES_Signature {
  offset = offset || 0;
  let asn1 = ASN1.decode(der, offset);
  var SES_Signature: SES_Signature;

  // 检测是否为 CMS ContentInfo 格式 (顶层 SEQUENCE 的第一个子元素是 OID)
  const asn1Any: any = asn1;
  if (asn1Any.sub && asn1Any.sub.length >= 2 &&
      asn1Any.sub[0]?.typeName?.() === "OBJECT_IDENTIFIER" &&
      asn1Any.sub[1]?.typeName?.() === "[0]") {
    try {
      return decodeCMS_Signature(asn1Any);
    } catch (e) {
      console.log("CMS decode failed:", e);
    }
  }

  try {
    // V1 版本解析
    const createDate = decodeUTCTime(asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[3]?.stream.parseTime(
      asn1.sub[0].sub[1].sub[0].sub[2].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].header,
      asn1.sub[0].sub[1].sub[0].sub[2].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[3].length));
    const validStart = decodeUTCTime(asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[4]?.stream.parseTime(
      asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header,
      asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].length));
    const validEnd = decodeUTCTime(asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[5]?.stream.parseTime(
      asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header,
      asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].length));
    const timeInfo = decodeUTCTime(asn1.sub[0]?.sub[2]?.stream.parseTime(
      asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header,
      asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header + asn1.sub[0].sub[2].length, false));

    const asn1CertList = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[2];
    let certList: any[] = [];
    if (asn1CertList) {
      asn1CertList.sub.forEach((asn1Cert: any) => {
        certList.push(asn1Cert.stream.parseOctetString(
          asn1Cert.stream.pos + asn1Cert.header,
          asn1Cert.stream.pos + asn1Cert.header + asn1Cert.length));
      });
    }

    const asn1ExtDatas = asn1.sub[0]?.sub[1]?.sub[0]?.sub[4];
    let extDatas: any[] = [];
    if (asn1ExtDatas) {
      asn1ExtDatas.sub.forEach((asn1ExtData: any) => {
        extDatas.push({
          'extnID': asn1ExtData.sub[0]?.stream.parseOID(
            asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header,
            asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header + asn1ExtData.sub[0].length),
          'critical': asn1ExtData.sub[1]?.stream.parseInteger(
            asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header,
            asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header + asn1ExtData.sub[1].length),
          'extnValue': asn1ExtData.sub[2]?.stream.parseOctetString(
            asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header,
            asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header + asn1ExtData.sub[2].length),
        });
      });
    }

    SES_Signature = {
      'realVersion': 1,
      'toSignDer': asn1.sub[0]?.stream.enc.subarray(
        asn1.sub[0].stream.pos, asn1.sub[0].stream.pos + asn1.sub[0].header + asn1.sub[0].length),
      'toSign': {
        'version': asn1.sub[0]?.sub[0]?.stream.parseInteger(
          asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header,
          asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header + asn1.sub[0].sub[0].length),
        'eseal': {
          'esealInfo': {
            'header': {
              'ID': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[0]?.stream.parseStringUTF(
                asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header,
                asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].length),
              'version': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[1]?.stream.parseInteger(
                asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header,
                asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].length),
              'Vid': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[2]?.stream.parseStringUTF(
                asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header,
                asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].length),
            },
            'esID': asn1.sub[0]?.sub[1]?.sub[0]?.sub[1]?.stream.parseStringUTF(
              asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header,
              asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[1].length),
            'property': {
              'type': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[0]?.stream.parseInteger(
                asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header,
                asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].length),
              'name': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[1]?.stream.parseStringUTF(
                asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header,
                asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].length),
              'certList': certList,
              'createDate': createDate,
              'validStart': validStart,
              'validEnd': validEnd,
            },
            'picture': {
              'type': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[0]?.stream.parseStringUTF(
                asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header,
                asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].length),
              'data': {
                'hex': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.parseOctetString(
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header,
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length),
                'byte': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.enc.subarray(
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header,
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length),
              },
              'width': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[2]?.stream.parseInteger(
                asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header,
                asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].length),
              'height': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[3]?.stream.parseInteger(
                asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header,
                asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].length),
            },
            'extDatas': extDatas,
          },
          'signInfo': {
            'cert': decodeCert(asn1.sub[0]?.sub[1]?.sub[1]?.sub[0]),
            'signatureAlgorithm': asn1.sub[0]?.sub[1]?.sub[1]?.sub[1]?.stream.parseOID(
              asn1.sub[0].sub[1].sub[1].sub[1].stream.pos + asn1.sub[0].sub[1].sub[1].sub[1].header,
              asn1.sub[0].sub[1].sub[1].sub[1].stream.pos + asn1.sub[0].sub[1].sub[1].sub[1].header + asn1.sub[0].sub[1].sub[1].sub[1].length),
            'signData': asn1.sub[0]?.sub[1]?.sub[1]?.sub[2]?.stream.hexDump(
              asn1.sub[0].sub[1].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[1].sub[2].header,
              asn1.sub[0].sub[1].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[1].sub[2].header + asn1.sub[0].sub[1].sub[1].sub[2].length, false),
          },
        },
        'timeInfo': timeInfo,
        'dataHash': asn1.sub[0]?.sub[3]?.stream.hexDump(
          asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header,
          asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header + asn1.sub[0].sub[3].length, false),
        'propertyInfo': asn1.sub[0]?.sub[4]?.stream.parseStringUTF(
          asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header,
          asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header + asn1.sub[0].sub[4].length),
        'cert': decodeCert(asn1.sub[0]?.sub[5]),
        'signatureAlgorithm': asn1.sub[0]?.sub[6]?.stream.parseOID(
          asn1.sub[0].sub[6].stream.pos + asn1.sub[0].sub[6].header,
          asn1.sub[0].sub[6].stream.pos + asn1.sub[0].sub[6].header + asn1.sub[0].sub[6].length),
      },
      'signature': asn1.sub[1]?.stream.hexDump(
        asn1.sub[1].stream.pos + asn1.sub[1].header,
        asn1.sub[1].stream.pos + asn1.sub[1].header + asn1.sub[1].length, false),
    };
  } catch (_e) {
    console.log("decodeSES_Signature V1 fail:",_e);
    try {
      // V4 版本解析
      const certListType = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[2]?.stream.parseInteger(
        asn1.sub[0].sub[1].sub[0].sub[2].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].header,
        asn1.sub[0].sub[1].sub[0].sub[2].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[2].length);
      const asn1CertList = asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[3];
      let certList: any[] = [];
      if (asn1CertList) {
        asn1CertList.sub.forEach((asn1Cert: any) => {
          certList.push(asn1Cert.stream.parseOctetString(
            asn1Cert.stream.pos + asn1Cert.header,
            asn1Cert.stream.pos + asn1Cert.header + asn1Cert.length));
        });
      }
      const asn1ExtDatas = asn1.sub[0]?.sub[1]?.sub[0]?.sub[4];
      let extDatas: any[] = [];
      if (asn1ExtDatas) {
        asn1ExtDatas.sub.forEach((asn1ExtData: any) => {
          extDatas.push({
            'extnID': asn1ExtData.sub[0]?.stream.parseOID(
              asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header,
              asn1ExtData.sub[0].stream.pos + asn1ExtData.sub[0].header + asn1ExtData.sub[0].length),
            'critical': asn1ExtData.sub[1]?.stream.parseInteger(
              asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header,
              asn1ExtData.sub[1].stream.pos + asn1ExtData.sub[1].header + asn1ExtData.sub[1].length),
            'extnValue': asn1ExtData.sub[2]?.stream.parseOctetString(
              asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header,
              asn1ExtData.sub[2].stream.pos + asn1ExtData.sub[2].header + asn1ExtData.sub[2].length),
          });
        });
      }
      SES_Signature = {
        'realVersion': 4,
        'toSignDer': asn1.sub[0]?.stream.enc.subarray(
          asn1.sub[0].stream.pos, asn1.sub[0].stream.pos + asn1.sub[0].header + asn1.sub[0].length),
        'toSign': {
          'version': asn1.sub[0]?.sub[0]?.stream.parseInteger(
            asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header,
            asn1.sub[0].sub[0].stream.pos + asn1.sub[0].sub[0].header + asn1.sub[0].sub[0].length),
          'eseal': {
            'esealInfo': {
              'header': {
                'ID': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[0]?.stream.parseStringUTF(
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header,
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[0].length),
                'version': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[1]?.stream.parseInteger(
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header,
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[1].length),
                'Vid': asn1.sub[0]?.sub[1]?.sub[0]?.sub[0]?.sub[2]?.stream.parseStringUTF(
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header,
                  asn1.sub[0].sub[1].sub[0].sub[0].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[0].sub[2].length),
              },
              'esID': asn1.sub[0]?.sub[1]?.sub[0]?.sub[1]?.stream.parseStringUTF(
                asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header,
                asn1.sub[0].sub[1].sub[0].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[1].length),
              'property': {
                'type': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[0]?.stream.parseInteger(
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header,
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[0].length),
                'name': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[1]?.stream.parseStringUTF(
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header,
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[1].length),
                'certListType': certListType,
                'certList': certList,
                'createDate': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[4]?.stream.parseTime(
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header,
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[4].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[4].length),
                'validStart': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[5]?.stream.parseTime(
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header,
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[5].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[5].length),
                'validEnd': asn1.sub[0]?.sub[1]?.sub[0]?.sub[2]?.sub[6]?.stream.parseTime(
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[6].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].header,
                  asn1.sub[0].sub[1].sub[0].sub[2].sub[6].stream.pos + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].header + asn1.sub[0].sub[1].sub[0].sub[2].sub[6].length),
              },
              'picture': {
                'type': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[0]?.stream.parseStringUTF(
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header,
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[0].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[0].length),
                'data': {
                  'hex': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.parseOctetString(
                    asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header,
                    asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length),
                  'byte': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[1]?.stream.enc.subarray(
                    asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header,
                    asn1.sub[0].sub[1].sub[0].sub[3].sub[1].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[1].length),
                },
                'width': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[2]?.stream.parseInteger(
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header,
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[2].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[2].length),
                'height': asn1.sub[0]?.sub[1]?.sub[0]?.sub[3]?.sub[3]?.stream.parseInteger(
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header,
                  asn1.sub[0].sub[1].sub[0].sub[3].sub[3].stream.pos + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].header + asn1.sub[0].sub[1].sub[0].sub[3].sub[3].length),
              },
              'extDatas': extDatas,
            },
            'cert': decodeCert(asn1.sub[0]?.sub[1]?.sub[1]),
            'signAlgID': asn1.sub[0]?.sub[1]?.sub[2]?.stream.parseOID(
              asn1.sub[0].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[2].header,
              asn1.sub[0].sub[1].sub[2].stream.pos + asn1.sub[0].sub[1].sub[2].header + asn1.sub[0].sub[1].sub[2].length),
            'signedValue': asn1.sub[0]?.sub[1]?.sub[3]?.stream.hexDump(
              asn1.sub[0].sub[1].sub[3].stream.pos + asn1.sub[0].sub[1].sub[3].header,
              asn1.sub[0].sub[1].sub[3].stream.pos + asn1.sub[0].sub[1].sub[3].header + asn1.sub[0].sub[1].sub[3].length, false),
          },
          'timeInfo': asn1.sub[0]?.sub[2]?.stream.parseTime(
            asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header,
            asn1.sub[0].sub[2].stream.pos + asn1.sub[0].sub[2].header + asn1.sub[0].sub[2].length, false),
          'dataHash': asn1.sub[0]?.sub[3]?.stream.hexDump(
            asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header,
            asn1.sub[0].sub[3].stream.pos + asn1.sub[0].sub[3].header + asn1.sub[0].sub[3].length, false),
          'propertyInfo': asn1.sub[0]?.sub[4] ? Uint8ArrayToString(asn1.sub[0].sub[4]) : '',
        },
        'cert': decodeCert(asn1.sub[1]),
        'signatureAlgID': asn1.sub[2]?.stream.parseOID(
          asn1.sub[2].stream.pos + asn1.sub[2].header,
          asn1.sub[2].stream.pos + asn1.sub[2].header + asn1.sub[2].length),
        'signature': asn1.sub[3]?.stream.hexDump(
          asn1.sub[3].stream.pos + asn1.sub[3].header,
          asn1.sub[3].stream.pos + asn1.sub[3].header + asn1.sub[3].length, false),
        'timpStamp': asn1.sub[4]?.stream.parseTime(
          asn1.sub[4].stream.pos + asn1.sub[4].header,
          asn1.sub[4].stream.pos + asn1.sub[4].header + asn1.sub[4].length),
      };
    } catch (e2) {
      console.log(e2);
      SES_Signature = { realVersion: 0, toSignDer: new Uint8Array(0), signature: '' };
    }
  }
  return SES_Signature;
}

/**
 * 解码 CMS ContentInfo (GM/T 0006) 格式的签名数据
 *
 * 实际 OFD 文件中的 SignedValue.dat 可能使用 CMS/PKCS#7 包装格式：
 *
 * ContentInfo SEQUENCE {
 *   contentType OID,          -- 1.2.156.10197.6.1.4.2.2 (signedData)
 *   [0] {
 *     SignedData SEQUENCE {
 *       version INTEGER,
 *       digestAlgorithms SET { SM3 },
 *       encapContentInfo SEQUENCE { eContentType OID },
 *       certificates [0] { X.509 Certificate },
 *       signerInfos SET {
 *         SignerInfo SEQUENCE {
 *           version,
 *           issuerAndSerialNumber,
 *           digestAlgorithm { SM3 },
 *           signedAttrs [0] { ... },
 *           signatureAlgorithm { SM2 },
 *           signature OCTET_STRING
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * @param cmsAsn1 - 已解码的 CMS ContentInfo ASN.1 节点
 * @returns SES 签名对象（不含 eseal 数据）
 */
function decodeCMS_Signature(cmsAsn1: any): SES_Signature {
  const signedData = cmsAsn1.sub[1].sub[0]; // [0] → SEQUENCE (SignedData)
  // signedData structure:
  // 0: version INTEGER
  // 1: digestAlgorithms SET
  // 2: encapContentInfo SEQUENCE
  // 3: certificates [0] IMPLICIT (contains certificate SEQUENCE)
  // 4: signerInfos SET
  const certificatesContainer = signedData.sub[3]; // [0] container
  const signerInfos = signedData.sub[4]; // SET of SignerInfo
  const signerInfo = signerInfos.sub[0]; // First SignerInfo

  // 提取第一个证书 (标准 X.509 Certificate SEQUENCE: [TBSCertificate, signatureAlgorithm, signatureValue])
  const certAsn1 = certificatesContainer.sub[0];
  // 解析证书信息（标准 X.509 结构）
  const tbsCert = certAsn1.sub[0]; // TBSCertificate SEQUENCE
  let subject = new Map();
  if (tbsCert.sub && tbsCert.sub.length > 5) {
    const asn1Subject = tbsCert.sub[5]; // subject (SEQUENCE of SET)
    if (asn1Subject.sub) {
      asn1Subject.sub.forEach((element: any) => {
        try {
          const key = element.sub[0].sub[0].content().split('\n')[0];
          const value = element.sub[0].sub[1]?.stream.parseStringUTF(
            element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header,
            element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header + element.sub[0].sub[1].length);
          subject.set(key, value);
        } catch { /* skip invalid entry */ }
      });
    }
  }
  let publicKeyAlgorithm = '';
  let publicKeyHex = '';
  if (tbsCert.sub && tbsCert.sub.length > 6) {
    const asn1PublicKeyInfo = tbsCert.sub[6];
    if (asn1PublicKeyInfo.sub) {
      publicKeyAlgorithm = asn1PublicKeyInfo.sub[0]?.stream.parseOID(
        asn1PublicKeyInfo.sub[0].stream.pos + asn1PublicKeyInfo.sub[0].header,
        asn1PublicKeyInfo.sub[0].stream.pos + asn1PublicKeyInfo.sub[0].header + asn1PublicKeyInfo.sub[0].length);
      publicKeyHex = asn1PublicKeyInfo.sub[1]?.stream.hexDump(
        asn1PublicKeyInfo.sub[1].stream.pos + asn1PublicKeyInfo.sub[1].header,
        asn1PublicKeyInfo.sub[1].stream.pos + asn1PublicKeyInfo.sub[1].header + asn1PublicKeyInfo.sub[1].length);
    }
  }
  const cert = {
    subject,
    'commonName': subject.get("2.5.4.3"),
    'subjectPublicKeyInfo': {
      'algorithm': publicKeyAlgorithm,
      'subjectPublicKey': publicKeyHex,
    },
  };

  // SignerInfo 结构:
  // 0: version INTEGER
  // 1: issuerAndSerialNumber
  // 2: digestAlgorithm
  // 3: signedAttrs [0] tagged SET of attributes (this is what's signed)
  // 4: signatureAlgorithm
  // 5: signature
  const signedAttrs = signerInfo.sub[3]; // [0] tagged SET of signed attributes
  const signerSigAlg = signerInfo.sub[4]; // SEQUENCE { OID, params }
  const signerSignature = signerInfo.sub[5]; // OCTET STRING (signature value)

  // toSignDer = signedAttrs 的完整 DER 编码（SM2 签名对象）
  const toSignDer = signedAttrs.stream.enc.subarray(
    signedAttrs.stream.pos,
    signedAttrs.stream.pos + signedAttrs.header + signedAttrs.length);

  // 签名值
  const sigValue = signerSignature.stream.hexDump(
    signerSignature.stream.pos + signerSignature.header,
    signerSignature.stream.pos + signerSignature.header + signerSignature.length);

  // 签名算法 OID
  const sigAlgOID = signerSigAlg.sub[0]?.stream.parseOID(
    signerSigAlg.sub[0].stream.pos + signerSigAlg.sub[0].header,
    signerSigAlg.sub[0].stream.pos + signerSigAlg.sub[0].header + signerSigAlg.sub[0].length);

  return {
    'realVersion': 4,
    'toSignDer': toSignDer,
    'toSign': null, // CMS 格式不含 SES eseal 数据
    'cert': cert,
    'signatureAlgID': sigAlgOID,
    'signature': sigValue,
  };
}

/**
 * Uint8Array 转字符串
 * @param fileData - 字节数组
 * @returns 字符串
 */
function Uint8ArrayToString(fileData: any): string {
  let dataString = "";
  for (let i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i]);
  }
  return dataString;
}

/**
 * 解码 X.509 证书信息
 * @param asn1 - ASN.1 证书结构
 * @returns 解码后的证书对象
 */
function decodeCert(asn1: any): DecodedCert {
  try {
    const asn1Subject = asn1.sub[0].sub[0].sub[5];
    let subject = new Map();
    asn1Subject.sub.forEach((element: any) => {
      const key = element.sub[0].sub[0].content().split('\n')[0];
      const value = element.sub[0].sub[1]?.stream.parseStringUTF(
        element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header,
        element.sub[0].sub[1].stream.pos + element.sub[0].sub[1].header + element.sub[0].sub[1].length);
      subject.set(key, value);
    });

    const asn1PublicKeyInfo = asn1.sub[0].sub[0].sub[6];
    return {
      subject,
      'commonName': subject.get("2.5.4.3"),
      'subjectPublicKeyInfo': {
        'algorithm': asn1PublicKeyInfo.sub[0]?.stream.parseOID(
          asn1PublicKeyInfo.sub[0].stream.pos + asn1PublicKeyInfo.sub[0].header,
          asn1PublicKeyInfo.sub[0].stream.pos + asn1PublicKeyInfo.sub[0].header + asn1PublicKeyInfo.sub[0].length),
        'subjectPublicKey': asn1PublicKeyInfo.sub[1]?.stream.hexDump(
          asn1PublicKeyInfo.sub[1].stream.pos + asn1PublicKeyInfo.sub[1].header,
          asn1PublicKeyInfo.sub[1].stream.pos + asn1PublicKeyInfo.sub[1].header + asn1PublicKeyInfo.sub[1].length),
      },
    };
  } catch (e) {
    console.log("decodeCert fail:",e);
    return { subject: new Map(), subjectPublicKeyInfo: { subjectPublicKey: '' } };
  }
}

