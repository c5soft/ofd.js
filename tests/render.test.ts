import { describe, it, expect } from "bun:test";
import { JSDOM } from 'jsdom';
import { renderOfd, renderOfdByScale } from '../src/ofd/ofd';
import type { OFDDocument } from '../src/ofd/ofd';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
// global.window = dom.window as unknown as Window & typeof globalThis;

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
  });

  describe('renderOfdByScale', () => {
    it('should return array of divs', () => {
      const result = renderOfdByScale(mockOfdDocument);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
