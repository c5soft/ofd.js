import {describe, it, expect} from "bun:test";
import { sha1, md5, rsaVerifySHA1 } from "../src/utils/crypto_util";

// SHA1 test vectors (FIPS 180-4)
const sha1Tests: { input: string; expected: string }[] = [
  { input: "", expected: "da39a3ee5e6b4b0d3255bfef95601890afd80709" },
  { input: "abc", expected: "a9993e364706816aba3e25717850c26c9cd0d89d" },
  { input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", expected: "84983e441c3bd26ebaae4aa1f95129e5e54670f1" },
];

// MD5 test vectors (RFC 1321)
const md5Tests: { input: string; expected: string }[] = [
  { input: "", expected: "d41d8cd98f00b204e9800998ecf8427e" },
  { input: "abc", expected: "900150983cd24fb0d6963f7d28e17f72" },
  { input: "abcdefghijklmnopqrstuvwxyz", expected: "c3fcd3d76192e4007dfb496cca67e13b" },
];

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("SHA1", () => {
  for (const t of sha1Tests) {
    it(`"${t.input.substring(0, 20)}..."`, () => {
      expect(sha1(toBytes(t.input))).toBe(t.expected);
    });
  }
});

describe("MD5", () => {
  for (const t of md5Tests) {
    it(`"${t.input.substring(0, 20)}..."`, () => {
      expect(md5(toBytes(t.input))).toBe(t.expected);
    });
  }
});

describe("RSA", () => {
  it("should return false for invalid signature", () => {
    // RSAPublicKey DER: SEQUENCE { INTEGER(n=3), INTEGER(e=65537) }
    // DER encoding: 30 0a 02 02 01 00 02 03 01 00 01
    // 30 = SEQUENCE, 0a = length 10
    // 02 02 01 00 = INTEGER of 2 bytes = 256 (n)
    // 02 03 01 00 01 = INTEGER of 3 bytes = 65537 (e)
    // With BIT STRING unused-bytes prefix "00":
    // RSAPublicKey DER: SEQUENCE { INTEGER(n=3), INTEGER(e=65537) }
    // 30 06 = SEQUENCE length 6
    // 02 01 03 = INTEGER 3
    // 02 03 01 00 01 = INTEGER 65537
    // With BIT STRING unused-bytes prefix "00":
    const pubKeyHex = "0030060201030203010001";
    const result = rsaVerifySHA1("00", "00", pubKeyHex);
    expect(result).toBe(false);
  });
});
