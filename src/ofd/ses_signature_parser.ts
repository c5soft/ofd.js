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

import { Hex } from "@lapo/asn1js/hex";
import { Base64 } from "@lapo/asn1js/base64";
import { ASN1 } from "@lapo/asn1js";
import { SES_Signature_Verify, digestByteArray } from "./verify_signature_util";

let reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;

/**
 * 从 ZIP 文件中解析 SES 签名数据
 * @param zip - JSZip 实例
 * @param name - 签章文件名
 * @returns 解析后的签章对象
 */
export async function parseSesSignature(zip: any, name: string): Promise<any> {
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
function decodeText(val: string): any {
  try {
    let der = reHex.test(val) ? Hex.decode(val) : Base64.unarmor(val);
    let res = decode(der);
    return res;
  } catch (e) {
    console.log(e);
    return {};
  }
}

/**
 * ASN.1 DER 解码入口
 * @param der - DER 编码的字节数组
 * @param offset - 偏移量
 * @returns 解码后的签章对象
 */
function decode(der: Uint8Array, offset?: number): any {
  offset = offset || 0;
  try {
    const SES_Signature = decodeSES_Signature(der, offset);
    const type = SES_Signature.toSign.eseal.esealInfo.picture.type;
    const ofdArray = SES_Signature.toSign.eseal.esealInfo.picture.data.byte;
    return {
      ofdArray,
      'type': (type.str || type).toLowerCase(),
      SES_Signature,
      'verifyRet': SES_Signature_Verify(SES_Signature),
    };
  } catch (_e) {
    console.log(_e);
    return {};
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
 * 解码 SES 签名 ASN.1 结构，支持 V1 和 V4 两种版本
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
 * @param der - DER 编码数据
 * @param offset - 偏移量
 * @returns SES 签名对象
 */
function decodeSES_Signature(der: Uint8Array, offset?: number): any {
  offset = offset || 0;
  let asn1 = ASN1.decode(der, offset);
  var SES_Signature: any;

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
    console.log(_e);
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
          'propertyInfo': asn1.sub[0]?.sub[4]?.stream.parseStringUTF(
            asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header,
            asn1.sub[0].sub[4].stream.pos + asn1.sub[0].sub[4].header + asn1.sub[0].sub[4].length),
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
      SES_Signature = {};
    }
  }
  return SES_Signature;
}

/**
 * 解码 X.509 证书信息
 * @param asn1 - ASN.1 证书结构
 * @returns 解码后的证书对象
 */
function decodeCert(asn1: any): any {
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
  } catch (_e) {
    console.log(_e);
    return {};
  }
}

