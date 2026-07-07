// Polyfill global object for browser compatibility
// Required by ofd-xml-parser which uses global.xmlParseFlag
if (typeof window !== 'undefined' && typeof global === 'undefined') {
  (window as Window & typeof globalThis).global = window;
}

export {
  parseOfdDocument,
  renderOfd,
  renderOfdByScale,
  setPageScale,
  getPageScale,
  calPageBox,
  calPageBoxScale,
  renderPage,
} from "./src/ofd_js/ofd";

export type {
  PageBox,
  Page,
  OFDDocument,
  DocumentInfo,
  ParseOptions,
} from "./src/ofd_js/ofd";
