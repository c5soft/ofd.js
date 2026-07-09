/**
 * Type declarations for sm-crypto
 */
declare module 'sm-crypto' {
  /**
   * SM3 hash function
   * @param input - input bytes or string
   * @returns hex string of hash result
   */
  export function sm3(input: number[] | string): string;

  /**
   * SM2 signature verification
   */
  export const sm2: {
    doVerifySignature: (
      msg: string,
      sigValueHex: string,
      publicKey: string,
      options: { der: boolean; hash: boolean; userId: string }
    ) => boolean;
  };
}
