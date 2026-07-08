/* Copyright 2017 Mozilla Foundation
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
 * Browser compatibility - only minimal Node.js compatibility needed.
 * All legacy browser polyfills for IE11/old Chrome have been removed since
 * the project no longer supports older browsers.
 */

import { isNodeJS } from "./is_node";

// Only keep Node.js compatibility for btoa/atob which is needed in some environments
if (isNodeJS) {
  // Support: Node.js (for testing/headless use)
  (function checkNodeBtoa() {
    if (globalThis.btoa) {
      return;
    }
    globalThis.btoa = function (chars: string) {
      return Buffer.from(chars, "binary").toString("base64");
    };
  })();

  (function checkNodeAtob() {
    if (globalThis.atob) {
      return;
    }
    globalThis.atob = function (input: string) {
      return Buffer.from(input, "base64").toString("binary");
    };
  })();
}

// All modern browsers (Chrome ≥ 50, Firefox ≥ 45, Safari ≥ 10, Edge ≥ 15)
// natively support all the ES2015+ features we use:
// - Promise, Promise.allSettled
// - String.startsWith/endsWith/includes
// - Array.includes/from
// - Object.assign/fromEntries/values/entries
// - TypedArray.prototype.slice
// - globalThis
// - Map/Set/WeakMap/WeakSet
// - URL, ReadableStream
// - Number.isNaN/isInteger
// - etc...
