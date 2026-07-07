import { describe, it, expect } from "bun:test";
import { JSDOM } from 'jsdom';
import { renderOfd, renderOfdByScale } from '../index';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

describe('OFD Rendering Functions', () => {
  const mockOfdDocument = {
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
