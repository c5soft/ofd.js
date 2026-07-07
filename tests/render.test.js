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
    test('renderOfd should return array of divs', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, mockOfdDocument);

      expect(Array.isArray(result)).toBe(true);
    });

    test('renderOfd should handle null document gracefully', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, null);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('renderOfd should handle undefined document gracefully', () => {
      const screenWidth = 1024;
      const result = renderOfd(screenWidth, undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('renderOfdByScale', () => {
    test('renderOfdByScale should return array of divs', () => {
      const result = renderOfdByScale(mockOfdDocument);

      expect(Array.isArray(result)).toBe(true);
    });

    test('renderOfdByScale should handle null document gracefully', () => {
      const result = renderOfdByScale(null);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('renderOfdByScale should handle undefined document gracefully', () => {
      const result = renderOfdByScale(undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
