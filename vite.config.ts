import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Injects the CSP meta tag in production builds only (dev needs the HMR websocket). */
function cspPlugin(): Plugin {
  return {
    name: 't3-widget-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  plugins: [react(), tailwindcss(), cspPlugin()],
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
});
