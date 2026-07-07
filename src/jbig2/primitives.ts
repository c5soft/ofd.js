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

import { unreachable } from "./util";

/** Sentinel value for end-of-file in PDF parsing. */
const EOF = {};

// ============ Name ============

/**
 * PDF Name object — represents a name symbol (e.g. /Type, /Pages).
 * Names are interned (cached) so that two names with the same string
 * share a single object, reducing memory and enabling fast comparison.
 */
class Name {
  readonly name: string;

  private constructor(name: string) {
    this.name = name;
  }

  private static _cache: Record<string, Name> = Object.create(null);

  /** Get or create a Name for the given string. */
  static get(name: string): Name {
    return Name._cache[name] ?? (Name._cache[name] = new Name(name));
  }

  /** Clear the name cache (used for testing). */
  static _clearCache(): void {
    Name._cache = Object.create(null);
  }
}

// ============ Cmd ============

/**
 * PDF Command object — represents a PDF operator (e.g. "cm", "Tj").
 * Like Name, commands are interned for performance.
 */
class Cmd {
  readonly cmd: string;

  private constructor(cmd: string) {
    this.cmd = cmd;
  }

  private static _cache: Record<string, Cmd> = Object.create(null);

  /** Get or create a Cmd for the given operator string. */
  static get(cmd: string): Cmd {
    return Cmd._cache[cmd] ?? (Cmd._cache[cmd] = new Cmd(cmd));
  }

  /** Clear the command cache (used for testing). */
  static _clearCache(): void {
    Cmd._cache = Object.create(null);
  }
}

// ============ Dict ============

/**
 * PDF Dictionary — maps string keys to values, with optional cross-reference
 * resolution. This is the in-memory representation of PDF dictionary objects.
 *
 * Key features:
 * - Supports up to three fallback keys for loose key lookup
 * - `getArray()` automatically dereferences Ref elements
 */
class Dict {
  _map: Record<string, unknown>;
  xref: unknown;
  objId: number | null;
  suppressEncryption: boolean;
  __nonSerializable__!: () => void;

  /**
   * An empty singleton dictionary. Useful as a default value.
   */
  static empty: Dict = new Dict(null);

  constructor(xref: unknown) {
    this._map = Object.create(null);
    this.xref = xref;
    this.objId = null;
    this.suppressEncryption = false;
  }

  /** Get the number of entries in this dictionary. */
  get size(): number {
    return Object.keys(this._map).length;
  }

  /** Assign a new cross-reference object. */
  assignXref(newXref: unknown): void {
    this.xref = newXref;
  }

  /**
   * Look up a key with up to two fallback keys.
   * Returns the first defined value found.
   */
  get<T = unknown>(key1: string, key2?: string, key3?: string): T {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return (this.xref as any).fetch(value, this.suppressEncryption) as T;
    }
    return value as T;
  }

  /** Async variant of get() — present for API compatibility. */
  async getAsync<T = unknown>(key1: string, key2?: string, key3?: string): Promise<T> {
    let value = this._map[key1];
    if (value === undefined && key2 !== undefined) {
      value = this._map[key2];
      if (value === undefined && key3 !== undefined) {
        value = this._map[key3];
      }
    }
    if (value instanceof Ref && this.xref) {
      return (this.xref as any).fetchAsync(value, this.suppressEncryption) as Promise<T>;
    }
    return value as T;
  }

  /**
   * Like get(), but if the result is an Array, dereferences any Ref elements
   * via the cross-reference table.
   */
  getArray<T = unknown>(key1: string, key2?: string, key3?: string): T[] {
    let value = this.get<T[]>(key1, key2, key3);
    if (!Array.isArray(value) || !this.xref) {
      return value;
    }
    value = value.slice();
    for (let i = 0, ii = value.length; i < ii; i++) {
      if (!(value[i] instanceof Ref)) {
        continue;
      }
      value[i] = (this.xref as any).fetch(value[i], this.suppressEncryption);
    }
    return value;
  }

  /** Get the raw value without dereferencing. */
  getRaw(key: string): unknown {
    return this._map[key];
  }

  /** Return all keys. */
  getKeys(): string[] {
    return Object.keys(this._map);
  }

  /** Return all raw values (no dereferencing). */
  getRawValues(): unknown[] {
    return Object.values(this._map);
  }

  /** Set a key to a value. */
  set(key: string, value: unknown): void {
    if (value === undefined) {
      unreachable('Dict.set: The "value" cannot be undefined.');
    }
    this._map[key] = value;
  }

  /** Check whether a key exists in this dictionary. */
  has(key: string): boolean {
    return this._map[key] !== undefined;
  }

  /** Iterate over all entries. */
  forEach(callback: (key: string, value: unknown) => void): void {
    for (const key in this._map) {
      callback(key, this.get(key));
    }
  }

  /**
   * Merge multiple dictionaries into one. If mergeSubDicts is true,
   * sub-dictionaries for the same key are also merged recursively.
   */
  static merge({
    xref,
    dictArray,
    mergeSubDicts = false,
  }: {
    xref: unknown;
    dictArray: Dict[];
    mergeSubDicts?: boolean;
  }): Dict {
    const mergedDict = new Dict(xref);

    if (!mergeSubDicts) {
      for (const dict of dictArray) {
        if (!(dict instanceof Dict)) continue;
        for (const [key, value] of Object.entries(dict._map)) {
          if (mergedDict._map[key] === undefined) {
            mergedDict._map[key] = value;
          }
        }
      }
      return mergedDict.size > 0 ? mergedDict : Dict.empty;
    }

    const properties = new Map<string, unknown[]>();
    for (const dict of dictArray) {
      if (!(dict instanceof Dict)) continue;
      for (const [key, value] of Object.entries(dict._map)) {
        let prop = properties.get(key);
        if (!prop) { prop = []; properties.set(key, prop); }
        prop.push(value);
      }
    }
    for (const [name, values] of properties) {
      if (mergeSubDicts && !mergedDict._map[name]) {
        mergedDict._map[name] = new Dict(xref);
      }
      for (const value of values) {
        if (value instanceof Dict) {
          const subDict = mergedDict._map[name] as Dict;
          for (const [key, val] of Object.entries(value._map)) {
            if (!(key in subDict._map)) subDict._map[key] = val;
          }
        } else {
          mergedDict._map[name] = value;
        }
      }
    }
    return mergedDict.size > 0 ? mergedDict : Dict.empty;
  }
}

// ============ Ref ============

/**
 * PDF object reference — pairs of (object number, generation number).
 * Refs are interned so that two references to the same object share
 * one instance, enabling fast comparison.
 */
class Ref {
  readonly num: number;
  readonly gen: number;

  private constructor(num: number, gen: number) {
    this.num = num;
    this.gen = gen;
  }

  private static _cache: Record<string, Ref> = Object.create(null);

  /** Get or create a Ref for (num, gen). */
  static get(num: number, gen: number): Ref {
    const key = gen === 0 ? `${num}R` : `${num}R${gen}`;
    return Ref._cache[key] ?? (Ref._cache[key] = new Ref(num, gen));
  }

  toString(): string {
    return `${this.num}R${this.gen}`;
  }

  /** Clear the reference cache (used for testing). */
  static _clearCache(): void {
    Ref._cache = Object.create(null);
  }
}

// ============ RefSet ============

/**
 * A set of references — tracks which objects have been processed (e.g.
 * to prevent infinite loops during PDF traversal).
 */
class RefSet {
  private _set = new Set<string>();

  has(ref: Ref): boolean {
    return this._set.has(ref.toString());
  }

  put(ref: Ref): void {
    this._set.add(ref.toString());
  }

  remove(ref: Ref): void {
    this._set.delete(ref.toString());
  }
}

// ============ RefSetCache ============

/**
 * A cache of references to objects provides dictionary-like access
 * where keys are Ref instances.
 */
class RefSetCache {
  private _map = new Map<string, unknown>();

  get size(): number {
    return this._map.size;
  }

  get(ref: Ref): unknown {
    return this._map.get(ref.toString());
  }

  has(ref: Ref): boolean {
    return this._map.has(ref.toString());
  }

  put(ref: Ref, obj: unknown): void {
    this._map.set(ref.toString(), obj);
  }

  putAlias(ref: Ref, aliasRef: Ref): void {
    this._map.set(ref.toString(), this.get(aliasRef));
  }

  forEach(callback: (value: unknown) => void): void {
    for (const value of this._map.values()) {
      callback(value);
    }
  }

  clear(): void {
    this._map.clear();
  }
}

// ============ Type Predicates ============

function isEOF(v: unknown): v is typeof EOF {
  return v === EOF;
}

function isName(v: unknown, name?: string): v is Name {
  return v instanceof Name && (name === undefined || v.name === name);
}

function isCmd(v: unknown, cmd?: string): v is Cmd {
  return v instanceof Cmd && (cmd === undefined || v.cmd === cmd);
}

function isDict(v: unknown, type?: string): v is Dict {
  return v instanceof Dict && (type === undefined || isName(v.get("Type"), type));
}

function isRef(v: unknown): v is Ref {
  return v instanceof Ref;
}

function isRefsEqual(v1: Ref, v2: Ref): boolean {
  return v1.num === v2.num && v1.gen === v2.gen;
}

function isStream(v: unknown): boolean {
  return typeof v === "object" && v !== null && typeof (v as { getBytes?: unknown }).getBytes === "function";
}

function clearPrimitiveCaches(): void {
  Cmd._clearCache();
  Name._clearCache();
  Ref._clearCache();
}

export {
  EOF,
  clearPrimitiveCaches,
  Cmd,
  Dict,
  Name,
  Ref,
  RefSet,
  RefSetCache,
  isEOF,
  isCmd,
  isDict,
  isName,
  isRef,
  isRefsEqual,
  isStream,
};
