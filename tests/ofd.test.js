import { describe, it, expect, beforeEach } from "bun:test";
import { parseOfdDocument, getPageScale, setPageScale } from '../src/index';

describe('OFD Module Basic Tests', () => {
  describe('Page Scale Functions', () => {
    beforeEach(() => {
      setPageScale(1.0);
    });

    it('should return default 1.0', () => {
      expect(getPageScale()).toBe(1.0);
    });

    it('should set scale value', () => {
      setPageScale(1.5);
      expect(getPageScale()).toBe(1.5);
    });


    it('should handle decimal values', () => {
      setPageScale(0.75);
      expect(getPageScale()).toBe(0.75);
    });

    it('should accept multiple updates', () => {
      setPageScale(0.8);
      expect(getPageScale()).toBe(0.8);
      setPageScale(1.2);
      expect(getPageScale()).toBe(1.2);
      setPageScale(2.0);
      expect(getPageScale()).toBe(2.0);
    });
  });

  describe('parseOfdDocument', () => {
    it('should be defined', () => {
      expect(parseOfdDocument).toBeDefined();
    });
  });
});
