/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Stream classes for PDF/JBIG2 binary data decoding.
 *
 * Provides the streaming infrastructure used by the JBIG2 decoder,
 * including base Stream, StringStream, and abstract DecodeStream.
 */

import { stringToBytes, unreachable } from "./util";
import { Dict } from "./primitives";

// ============ Stream ============

/**
 * Base stream that wraps a byte array and provides sequential read access.
 */
class Stream {
  bytes: Uint8Array;
  start: number;
  pos: number;
  end: number;
  dict: Dict | undefined;

  constructor(
    arrayBuffer: Uint8Array | ArrayBuffer,
    start?: number,
    length?: number,
    dict?: Dict
  ) {
    this.bytes =
      arrayBuffer instanceof Uint8Array
        ? arrayBuffer
        : new Uint8Array(arrayBuffer);
    this.start = start || 0;
    this.pos = this.start;
    this.end = start! + (length ?? 0) || this.bytes.length;
    this.dict = dict;
  }

  get length(): number {
    return this.end - this.start;
  }

  get isEmpty(): boolean {
    return this.length === 0;
  }

  getByte(): number {
    return this.pos >= this.end ? -1 : this.bytes[this.pos++];
  }

  getUint16(): number {
    const b0 = this.getByte();
    const b1 = this.getByte();
    if (b0 === -1 || b1 === -1) return -1;
    return (b0 << 8) + b1;
  }

  getInt32(): number {
    const b0 = this.getByte();
    const b1 = this.getByte();
    const b2 = this.getByte();
    const b3 = this.getByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }

  getBytes(length?: number, forceClamped = false): Uint8Array | Uint8ClampedArray {
    if (length === undefined || length === null) {
      const sub = this.bytes.subarray(this.pos, this.end);
      this.pos = this.end;
      return forceClamped ? new Uint8ClampedArray(sub) : sub;
    }
    const end = Math.min(this.pos + length, this.end);
    const sub = this.bytes.subarray(this.pos, end);
    this.pos = end;
    return forceClamped ? new Uint8ClampedArray(sub) : sub;
  }

  peekByte(): number {
    const b = this.getByte();
    if (b !== -1) this.pos--;
    return b;
  }

  peekBytes(length: number, forceClamped = false): Uint8Array | Uint8ClampedArray {
    const bytes = this.getBytes(length, forceClamped);
    this.pos -= bytes.length;
    return bytes;
  }

  getByteRange(begin: number, end: number): Uint8Array {
    return this.bytes.subarray(Math.max(0, begin), Math.min(end, this.end));
  }

  skip(n: number): void {
    this.pos += n || 1;
  }

  reset(): void {
    this.pos = this.start;
  }

  moveStart(): void {
    this.start = this.pos;
  }

  makeSubStream(start: number, length: number, dict: Dict): Stream {
    return new Stream(this.bytes.buffer as ArrayBuffer, start, length, dict);
  }
}

// ============ StringStream ============

/**
 * A stream whose data comes from a string (converted to bytes).
 */
class StringStream extends Stream {
  constructor(str: string) {
    super(stringToBytes(str));
  }
}

// ============ DecodeStream ============

/**
 * Abstract base class for decoding streams.
 * Subclasses implement readBlock() to produce decoded data.
 */
// Shared empty buffer to avoid creating many empty Uint8Arrays.
const emptyBuffer = new Uint8Array(0);

abstract class DecodeStream {
  _rawMinBufferLength: number;
  pos: number;
  bufferLength: number;
  eof: boolean;
  buffer: Uint8Array;
  minBufferLength: number;
  str?: any;

  constructor(maybeMinBufferLength?: number) {
    this._rawMinBufferLength = maybeMinBufferLength || 0;
    this.pos = 0;
    this.bufferLength = 0;
    this.eof = false;
    this.buffer = emptyBuffer;
    this.minBufferLength = 512;
    if (maybeMinBufferLength) {
      while (this.minBufferLength < maybeMinBufferLength) {
        this.minBufferLength *= 2;
      }
    }
  }

  get isEmpty(): boolean {
    while (!this.eof && this.bufferLength === 0) {
      this.readBlock();
    }
    return this.bufferLength === 0;
  }

  ensureBuffer(requested: number): Uint8Array {
    if (requested <= this.buffer.byteLength) {
      return this.buffer;
    }
    let size = this.minBufferLength;
    while (size < requested) {
      size *= 2;
    }
    const newBuffer = new Uint8Array(size);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    return this.buffer;
  }

  getByte(): number {
    while (this.bufferLength <= this.pos) {
      if (this.eof) return -1;
      this.readBlock();
    }
    return this.buffer[this.pos++];
  }

  getUint16(): number {
    const b0 = this.getByte();
    const b1 = this.getByte();
    if (b0 === -1 || b1 === -1) return -1;
    return (b0 << 8) + b1;
  }

  getInt32(): number {
    const b0 = this.getByte();
    const b1 = this.getByte();
    const b2 = this.getByte();
    const b3 = this.getByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }

  getBytes(length?: number, _forceClamped = false): Uint8Array | Uint8ClampedArray {
    if (length) {
      this.ensureBuffer(this.pos + length);
      while (!this.eof && this.bufferLength < this.pos + length) {
        this.readBlock();
      }
      const end = Math.min(this.bufferLength, this.pos + length);
      const sub = this.buffer.subarray(this.pos, end);
      this.pos = end;
      return _forceClamped && !(sub instanceof Uint8ClampedArray)
        ? new Uint8ClampedArray(sub)
        : sub;
    }
    while (!this.eof) {
      this.readBlock();
    }
    const sub = this.buffer.subarray(this.pos, this.bufferLength);
    this.pos = this.bufferLength;
    return _forceClamped && !(sub instanceof Uint8ClampedArray)
      ? new Uint8ClampedArray(sub)
      : sub;
  }

  peekByte(): number {
    const b = this.getByte();
    if (b !== -1) this.pos--;
    return b;
  }

  peekBytes(length: number, forceClamped = false): Uint8Array | Uint8ClampedArray {
    const b = this.getBytes(length, forceClamped);
    this.pos -= b.length;
    return b;
  }

  skip(n: number): void {
    if (!n) n = 1;
    this.pos += n;
  }

  reset(): void {
    this.pos = 0;
  }

  makeSubStream(start: number, length: number, dict: Dict): Stream {
    const end = start + length;
    while (this.bufferLength <= end && !this.eof) {
      this.readBlock();
    }
    return new Stream(this.buffer, start, length, dict);
  }

  getByteRange(_begin: number, _end: number): Uint8Array {
    unreachable("Should not call DecodeStream.getByteRange");
  }

  getBaseStreams(): Stream[] {
    return this.str?.getBaseStreams?.() ?? [];
  }

  /** Subclasses must implement this to decode the next block of data. */
  abstract readBlock(): void;
}

export { Stream, StringStream, DecodeStream };
