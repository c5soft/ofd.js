// Mock setup for tests
global.document = window.document;
global.XMLHttpRequest = jest.fn();

// Mock jszip-utils
jest.mock('jszip-utils', () => ({
  getBinaryContent: jest.fn((url, callback) => {
    callback(null, new ArrayBuffer(0));
  }),
}));

// Mock @xmldom/xmldom
jest.mock('@xmldom/xmldom', () => ({
  DOMParser: class {
    parseFromString() {
      return {};
    }
  },
}));
