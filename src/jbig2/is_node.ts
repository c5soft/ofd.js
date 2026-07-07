/* Copyright 2018 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the the License on the basis of an as-is basis,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Detect if running in Node.js environment.
 *
 * NW.js / Electron is a browser context, but copies some Node.js objects;
 * This detection distinguishes between actual Node.js and these browser environments.
 *
 * @returns True if running in Node.js, false otherwise.
 */
const isNodeJS: boolean =
  typeof process === "object" &&
  process + "" === "[object process]" &&
  !(process.versions as Record<string, string | undefined>).nw &&
  !((process.versions as Record<string, string | undefined>).electron && (process as any).type && (process as any).type !== "browser");

export { isNodeJS };
