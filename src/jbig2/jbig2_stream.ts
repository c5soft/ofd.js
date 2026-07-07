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
 * JBIG2 流包装器
 *
 * 将 JBIG2 压缩的二进制数据解码为像素数据。
 * 在 OFD 文档中，如果多媒体资源的格式为 JBIG2（GBIG2/JB2），
 * 则使用本模块解码为位图数据。
 * 参见 GB/T 33190-2016 第 7.7 节
 */

import { isDict, isStream } from "./primitives";
import { DecodeStream } from "./stream";
import { Jbig2Image } from "./jbig2";
import { shadow } from "./util";

/**
 * JBIG2 stream that decodes JBIG2 encoded data into raw bitmap data.
 * Wraps the Jbig2Image decoder into a stream interface compatible
 * with the PDF.js streaming infrastructure.
 *
 * Usage:
 *   const stream = new Jbig2Stream(sourceStream, length, dict, params);
 *   const pixels = stream.getBytes(); // RGBA pixel data
 */
class Jbig2Stream extends DecodeStream {
  declare stream: any;
  declare maybeLength: number;
  declare dict: any;
  declare params: any;

  // Inherited from DecodeStream — redeclared for TypeScript visibility.
  declare buffer: Uint8Array;
  declare bufferLength: number;
  declare eof: boolean;

  constructor(stream: any, maybeLength: number, dict: any, params: any) {
    super(maybeLength);
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;
  }

  /**
   * Lazy-load the raw compressed bytes from the source stream.
   * Uses shadow() to memoize the result so the source is only read once.
   */
  get bytes(): Uint8Array {
    return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
  }

  /**
   * Override the default ensureBuffer to no-op, since readBlock
   * directly assigns the complete decoded buffer rather than
   * incrementally filling it.
   */
  ensureBuffer(_requested: number): Uint8Array {
    // No-op — readBlock always produces the entire image at once.
    return this.buffer;
  }

  /**
   * Decode the JBIG2 image data.
   *
   * If the dictionary has a "JBIG2Globals" entry it is prepended as a
   * global segment before the stream's own data.
   */
  readBlock(): void {
    if (this.eof) {
      return;
    }

    const jbig2Image = new Jbig2Image();

    const chunks: Array<{ data: Uint8Array; start: number; end: number }> = [];

    if (isDict(this.params)) {
      const globalsStream: any = this.params.get("JBIG2Globals");
      if (isStream(globalsStream)) {
        const globals = globalsStream.getBytes();
        chunks.push({ data: globals, start: 0, end: globals.length });
      }
    }

    chunks.push({ data: this.bytes, start: 0, end: this.bytes.length });

    const data = jbig2Image.parseChunks(chunks);
    const dataLength = data.length;

    // JBIG2 stores black as 1 and white as 0; invert for screen display.
    for (let i = 0; i < dataLength; i++) {
      data[i] ^= 0xff;
    }

    this.buffer = data as unknown as Uint8Array;
    this.bufferLength = dataLength;
    this.eof = true;
  }
}

export { Jbig2Stream };
