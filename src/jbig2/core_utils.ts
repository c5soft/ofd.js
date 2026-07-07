/* Copyright 2019 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY in any that you can use this
 * distribution.
 *
 * The core utils for JBIG2 decoding.
 */

import { assert, BaseException, warn } from "./util";
import { Dict } from "./primitives";

/**
 * Exception thrown when there's missing data in the stream.
 */
class MissingDataException extends BaseException {
  begin: number;
  end: number;
  constructor(begin: number, end: number) {
    super(`Missing data [${begin}, ${end})`);
    this.begin = begin;
    this.end = end;
  }
}

class XRefEntryException extends BaseException {}
class XRefParseException extends BaseException {}

/**
 * Get the value of an inheritable property.
 * If the property is inheritable, traverse up the parent chain to find it.
 */
function getInheritableProperty({
  dict,
  key,
  getArray = false,
  stopWhenFound = true,
}: {
  dict: Dict;
  key: string;
  getArray?: boolean;
  stopWhenFound?: boolean;
}): any {
  const LOOP_LIMIT = 100;
  let loopCount = 0;
  let values: any[] | undefined;
  let currentDict: Dict | null = dict;
  while (currentDict) {
    const value = getArray ? currentDict.getArray(key) : currentDict.get(key);
    if (value !== undefined) {
      if (stopWhenFound) {
        return value;
      }
      if (!values) {
        values = [];
      }
      values.push(value);
    }
    if (++loopCount > LOOP_LIMIT) {
      warn(`getInheritableProperty: maximum loop count exceeded for "${key}"`);
      break;
    }
    currentDict = currentDict.get("Parent");
  }
  return values;
}

// Calculate the base 2 logarithm, returning the ceiling.
function log2(x: number): number {
  if (x <= 0) {
    return 0;
  }
  return Math.ceil(Math.log2(x));
}

function readInt8(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) >> 24;
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

// Checks if ch is one of: SPACE, TAB, CR or LF.
function isWhiteSpace(ch: number): boolean {
  return ch === 0x20 || ch === 0x09 || ch === 0x0d || ch === 0x0a;
}

export {
  getLookupTableFactory,
  MissingDataException,
  XRefEntryException,
  XRefParseException,
  getInheritableProperty,
  toRomanNumerals,
  log2,
  readInt8,
  readUint16,
  readUint32,
  isWhiteSpace,
};

/**
 * Creates a lookup table factory that caches the result.
 * Useful for creating lookup tables that are cached on first access.
 */
function getLookupTableFactory<T>(initializer: (lookup: T) => void): () => T {
  let lookup: T;
  return function () {
    if (initializer) {
      lookup = Object.create(null) as T;
      initializer(lookup);
      initializer = null as any;
    }
    return lookup;
  };
}

/**
 * Converts an integer to a Roman numeral.
 */
function toRomanNumerals(number: number, lowerCase = false): string {
  assert(
    Number.isInteger(number) && number > 0,
    "The number should be a positive integer."
  );
  const ROMAN_NUMBER_MAP = [
    "",
    "C",
    "CC",
    "CCC",
    "CD",
    "D",
    "DC",
    "DCC",
    "DCCC",
    "CM",
    "",
    "X",
    "XX",
    "XXX",
    "XL",
    "L",
    "LX",
    "LXX",
    "LXXX",
    "XC",
    "",
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
  ];
  let romanBuf: string[] = [];
  let quotient;
  // Thousands
  while (number >= 1000) {
    romanBuf.push("M");
    number -= 1000;
  }
  // Hundreds
  quotient = number / 100 | 0;
  number %= 100;
  romanBuf.push(ROMAN_NUMBER_MAP[quotient]);
  // Tens
  quotient = number / 10 | 0;
  number %= 10;
  romanBuf.push(ROMAN_NUMBER_MAP[10 + quotient]);
  // Ones
  romanBuf.push(ROMAN_NUMBER_MAP[20 + number]);
  if (lowerCase) {
    return romanBuf.join("").toLowerCase();
  }
  return romanBuf.join("");
}
