// Mock setup for tests - jsdom for bun test runner
// const { JSDOM } = require('jsdom');
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.TextEncoder = dom.window.TextEncoder;
global.TextDecoder = dom.window.TextDecoder;

// Mock jszip-utils
jest.mock('jszip-utils', () => ({
  getBinaryContent: jest.fn((url, callback) => {
    callback(null, new ArrayBuffer(0));
  }),
}));

// Mock @xmldom/xmldom
jest.mock('@xmldom/xmldom', () => ({
  DOMParser: class {
    // eslint-disable-next-line class-methods-use-this
    parseFromString() {
      return {};
    }
  },
}));
