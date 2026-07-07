/**
 * Type declarations for @lapo/asn1js
 */
declare module "@lapo/asn1js" {
  export class Stream {
    constructor(stream: Stream | Uint8Array, pos?: number);
    pos: number;
    header: number;
    length: number;
    enc: Uint8Array;
    parseTime(start: number, end: number, shortYear?: boolean): string;
    parseOctetString(start: number, end: number): Uint8Array;
    parseInteger(start: number, end: number): number;
    parseStringUTF(start: number, end: number): string;
    parseOID(start: number, end: number): string;
    hexDump(start: number, end: number, compact?: boolean): string;
  }

  export class ASN1 {
    static decode(stream: Uint8Array | Stream, offset?: number, type?: typeof ASN1): ASN1;
    sub: ASN1[];
    stream: Stream;
    content(): string;
    header: number;
    length: number;
  }
}

declare module "@lapo/asn1js/hex" {
  export class Hex {
    static decode(a: string | number[]): Uint8Array;
  }
}

declare module "@lapo/asn1js/base64" {
  export class Base64 {
    static decode(a: string | number[]): Uint8Array;
    static unarmor(a: string): Uint8Array;
  }
}
