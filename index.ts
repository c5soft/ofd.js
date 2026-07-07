// Polyfill global object for browser compatibility
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
