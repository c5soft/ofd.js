import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { presetWind4, transformerDirectives, transformerVariantGroup } from 'unocss';
import Unocss from 'unocss/vite';

export default defineConfig({
  plugins: [
    solidPlugin(),
    Unocss({
      presets: [presetWind4()],
      transformers: [transformerVariantGroup(), transformerDirectives()],
    }),
  ],
  server: {
    port: 3000,
    // Add CSP header that allows unsafe-eval for development
    headers: {
      'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://* http://*;",
    },
  },
  build: {
    // 始终启用 sourcemap 方便调试，即便在 production 模式
    sourcemap: true,
  },
});
