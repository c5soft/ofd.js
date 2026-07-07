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

// @ts-nocheck - This file implements browser polyfills and intentionally does
// non-TypeScript-safe things (reassigning globalThis, checking for undefined
// built-in methods, etc.) that are required for legacy browser support.

/**
 * Browser compatibility polyfills for older browsers.
 *
 * This file provides polyfills for modern JavaScript features that may not be
 * available in older browsers, using core-js when needed.
 */

import { isNodeJS } from "./is_node";

// PDF.js build variable - always undefined in this project
declare var PDFJSDev: any;

// Skip compatibility checks for modern builds and if we already ran the module.
if (
  (typeof PDFJSDev === "undefined" || !PDFJSDev.test("SKIP_BABEL")) &&
  (typeof globalThis === "undefined" || !(globalThis as any)._pdfjsCompatibilityChecked)
) {
  // Provides support for globalThis in legacy browsers.
  // Support: IE11/Edge, Opera
  if (typeof globalThis === "undefined" || globalThis.Math !== Math) {
    // @ts-expect-error - globalThis reassignment is for IE11 polyfill
    globalThis = require("core-js/es/global-this");
  }
  (globalThis as any)._pdfjsCompatibilityChecked = true;

  // Support: Node.js
  (function checkNodeBtoa() {
    if ((globalThis as any).btoa || !isNodeJS) {
      return;
    }
    (globalThis as any).btoa = function (chars: string) {
      return (Buffer as any).from(chars, "binary").toString("base64");
    };
  })();

  // Support: Node.js
  (function checkNodeAtob() {
    if ((globalThis as any).atob || !isNodeJS) {
      return;
    }
    (globalThis as any).atob = function (input: string) {
      return (Buffer as any).from(input, "base64").toString("binary");
    };
  })();

  // Provides support for String.prototype.startsWith in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringStartsWith() {
    if (String.prototype.startsWith) {
      return;
    }
    require("core-js/es/string/starts-with.js");
  })();

  // Provides support for String.prototype.endsWith in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringEndsWith() {
    if (String.prototype.endsWith) {
      return;
    }
    require("core-js/es/string/ends-with.js");
  })();

  // Provides support for String.prototype.includes in legacy browsers.
  // Support: IE, Chrome<41
  (function checkStringIncludes() {
    if (String.prototype.includes) {
      return;
    }
    require("core-js/es/string/includes.js");
  })();

  // Provides support for Array.prototype.includes in legacy browsers.
  // Support: IE, Chrome<47
  (function checkArrayIncludes() {
    if (Array.prototype.includes) {
      return;
    }
    require("core-js/es/array/includes.js");
  })();

  // Provides support for Array.from in legacy browsers.
  // Support: IE
  (function checkArrayFrom() {
    if (Array.from) {
      return;
    }
    require("core-js/es/array/from.js");
  })();

  // Provides support for Object.assign in legacy browsers.
  // Support: IE
  (function checkObjectAssign() {
    if (Object.assign) {
      return;
    }
    require("core-js/es/object/assign.js");
  })();

  // Provides support for Object.fromEntries in legacy browsers.
  // Support: IE, Chrome<73
  (function checkObjectFromEntries() {
    if (Object.fromEntries) {
      return;
    }
    require("core-js/es/object/from-entries.js");
  })();

  // Provides support for Math.log2 in legacy browsers.
  // Support: IE, Chrome<38
  (function checkMathLog2() {
    if (Math.log2) {
      return;
    }
    Math.log2 = require("core-js/es/math/log2.js");
  })();

  // Provides support for Number.isNaN in legacy browsers.
  // Support: IE.
  (function checkNumberIsNaN() {
    if (Number.isNaN) {
      return;
    }
    Number.isNaN = require("core-js/es/number/is-nan.js");
  })();

  // Provides support for Number.isInteger in legacy browsers.
  // Support: IE, Chrome<34
  (function checkNumberIsInteger() {
    if (Number.isInteger) {
      return;
    }
    Number.isInteger = require("core-js/es/number/is-integer.js");
  })();

  // Provides support for TypedArray.prototype.slice in legacy browsers.
  // Support: IE
  (function checkTypedArraySlice() {
    if (Uint8Array.prototype.slice) {
      return;
    }
    require("core-js/es/typed-array/slice");
  })();

  // Provides support for *recent* additions to the Promise specification,
  // however basic Promise support is assumed to be available natively.
  // Support: Firefox<71, Safari<13, Chrome<76
  (function checkPromise() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders are synchronous, hence `Promise` shouldn't
      // need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    if ((globalThis as any).Promise.allSettled) {
      return;
    }
    (globalThis as any).Promise = require("core-js/es/promise/index.js");
  })();

  // Support: IE
  (function checkURL() {
    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")) {
      // Prevent "require is not a function" errors in development mode,
      // since the `URL` constructor should be available in modern browers.
      return;
    } else if (!PDFJSDev.test("GENERIC")) {
      // The `URL` constructor is assumed to be available in the extension
      // builds.
      return;
    } else if (PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders don't use the `URL` constructor, so it
      // doesn't need to be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    (globalThis as any).URL = require("core-js/web/url.js");
  })();

  // Support: IE, Node.js
  (function checkReadableStream() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      // The current image decoders are synchronous, hence `ReadableStream` shouldn't
      // shouldn't be polyfilled for the IMAGE_DECODERS build target.
      return;
    }
    let isReadableStreamSupported = false;

    if (typeof ReadableStream !== "undefined") {
      // MS Edge may say it has ReadableStream but they are not up to spec.
      try {
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
        isReadableStreamSupported = true;
      } catch (_e) {
        // The ReadableStream constructor cannot be used.
      }
    }
    if (isReadableStreamSupported) {
      return;
    }
    (globalThis as any).ReadableStream = require("web-streams-polyfill/dist/ponyfill.js").ReadableStream;
  })();

  // We want to support Map iteration, but it doesn't seem to be easily
  // testable; hence using a similarly unsupported property.
  // Support: IE11
  (function checkMapEntries() {
    if ((globalThis as any).Map && (globalThis as any).Map.prototype.entries) {
      return;
    }
    (globalThis as any).Map = require("core-js/es/map/index.js");
  })();

  // We want to support Set iteration, but it doesn't seem to be easily
  // testable; hence using a similarly unsupported property.
  // Support: IE11
  (function checkSetEntries() {
    if ((globalThis as any).Set && (globalThis as any).Set.prototype.entries) {
      return;
    }
    (globalThis as any).Set = require("core-js/es/set/index.js");
  })();

  // Support: IE<11, Safari<8, Chrome<36
  (function checkWeakMap() {
    if ((globalThis as any).WeakMap) {
      return;
    }
    (globalThis as any).WeakMap = require("core-js/es/weak-map/index.js");
  })();

  // Support: IE11
  (function checkWeakSet() {
    if ((globalThis as any).WeakSet) {
      return;
    }
    (globalThis as any).WeakSet = require("core-js/es/weak-set/index.js");
  })();

  // Provides support for String.codePointAt in legacy browsers.
  // Support: IE11.
  (function checkStringCodePointAt() {
    if (String.prototype.codePointAt) {
      return;
    }
    require("core-js/es/string/code-point-at.js");
  })();

  // Provides support for String.fromCodePoint in legacy browsers.
  // Support: IE11.
  (function checkStringFromCodePoint() {
    if (String.fromCodePoint) {
      return;
    }
    String.fromCodePoint = require("core-js/es/string/from-code-point.js");
  })();

  // Provides support for String.prototype.padStart in legacy browsers.
  // Support: IE, Chrome<57
  (function checkStringPadStart() {
    if (String.prototype.padStart) {
      return;
    }
    require("core-js/es/string/pad-start.js");
  })();

  // Provides support for String.prototype.padEnd in legacy browsers.
  // Support: IE, Chrome<57
  (function checkStringPadEnd() {
    if (String.prototype.padEnd) {
      return;
    }
    require("core-js/es/string/pad-end.js");
  })();

  // Support: IE
  (function checkSymbol() {
    if ((globalThis as any).Symbol) {
      return;
    }
    require("core-js/es/symbol/index.js");
  })();

  // Provides support for Object.values in legacy browsers.
  // Support: IE, Chrome<54
  (function checkObjectValues() {
    if (Object.values) {
      return;
    }
    Object.values = require("core-js/es/object/values.js");
  })();

  // Provides support for Object.entries in legacy browsers.
  // Support: IE, Chrome<54
  (function checkObjectEntries() {
    if (Object.entries) {
      return;
    }
    Object.entries = require("core-js/es/object/entries.js");
  })();
}
