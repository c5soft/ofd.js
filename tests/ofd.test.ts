import { describe, it, expect, beforeEach } from "bun:test";
import { JSDOM } from 'jsdom';
import {
  parseOfdDocument,
  getPageScale,
  setPageScale,
  renderOfd,
  renderOfdByScale
} from '../src/index';
import type { OFDDocument } from '../src/ofd/ofd';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

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

describe('OFD Rendering Functions', () => {
  const mockOfdDocument: OFDDocument = {
    pages: [
      {
        'page-1': {
          json: {
            'ofd:Area': {
              'ofd:PhysicalBox': '0 0 210 297'
            }
          }
        },
      },
    ],
    document: {
      'ofd:CommonData': {
        'ofd:PageArea': {
          'ofd:PhysicalBox': '0 0 210 297'
        }
      }
    },
    tpls: {},
    fontResObj: {},
    drawParamResObj: {},
    multiMediaResObj: {},
  };

  describe('renderOfd', () => {
    it('should return array of divs', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, mockOfdDocument);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle null document gracefully', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, null);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle undefined document gracefully', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('renderOfdByScale', () => {
    it('should return array of divs', () => {
      const result = renderOfdByScale(mockOfdDocument);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle null document gracefully', () => {
      const result = renderOfdByScale(null);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle undefined document gracefully', () => {
      const result = renderOfdByScale(undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
