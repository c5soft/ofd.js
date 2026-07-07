import {
    sm2, sm3
} from "sm-crypto";
import { sha1, md5, rsaVerifySHA1 } from "./crypto_util";
import {Uint8ArrayToHexString} from "./ofd_util";
import { Base64 } from "./asn1_util";

export const digestByteArray = function(data,hashedBase64,checkMethod){
    const hashedHex = Uint8ArrayToHexString(Base64.decode(hashedBase64));
    checkMethod = checkMethod.toLowerCase();
    if(checkMethod.indexOf("1.2.156.10197.1.401")>=0 || checkMethod.indexOf("sm3")>=0){
        // sm-crypto sm3 accepts byte array input
        return hashedHex===sm3(Array.from(data));
    }else if(checkMethod.indexOf("md5")>=0){
        return hashedHex===md5(data);
    }else if(checkMethod.indexOf("sha1")>=0){
        return hashedHex===sha1(data);
    }else{
        return "";
    }
}

export const SES_Signature_Verify = function(SES_Signature){
    try {
        let signAlg = SES_Signature.realVersion<4?SES_Signature.toSign.signatureAlgorithm:SES_Signature.signatureAlgID;
        signAlg = signAlg.toLowerCase();
        const msg = SES_Signature.toSignDer;
        if(signAlg.indexOf("1.2.156.10197.1.501")>=0 || signAlg.indexOf("1.2.156.10197.1.301")>=0 || signAlg.indexOf("sm2")>=0){
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g,'').replace(/\n/g,'');
            if(publicKey.indexOf('00')==0){
                publicKey = publicKey.substr(2,publicKey.length-2);
            }
            return sm2.doVerifySignature(msg, sigValueHex, publicKey, {
                der : true,
                hash: true,
                userId:"1234567812345678"
            });
        }else{
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g,'').replace(/\n/g,'');
            if(publicKey.indexOf('00')==0){
                publicKey = publicKey.substr(2,publicKey.length-2);
            }
            return rsaVerifySHA1(Uint8ArrayToHexString(msg), sigValueHex, publicKey);
        }
    } catch (e) {
        console.log(e)
        return false;
    }
}
