/// <reference types="vitest/config" />
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for production builds (privacy + XSS defence).
 * `connect-src 'self'` means the app cannot send data to any other origin,
 * even by accident. Not applied in dev because Vite's HMR uses inline scripts.
 * Relax deliberately (and document in docs/decisions.md) if a feature needs it.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'family-finance:csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/**
 * Bundle budget (ADR-020): the build fails when all JS together exceeds it
 * gzipped. Raising it is a decision, recorded in docs/decisions.md.
 */
const JS_BUDGET_GZIP_KB = 160;

const bundleBudget = (): Plugin => ({
  name: 'family-finance:bundle-budget',
  apply: 'build',
  generateBundle(_, bundle) {
    const bytes = Object.values(bundle).reduce(
      (total, output) => (output.type === 'chunk' ? total + gzipSync(output.code).length : total),
      0,
    );
    const kb = bytes / 1000;
    if (kb > JS_BUDGET_GZIP_KB) {
      this.error(`JS bundle is ${kb.toFixed(2)} kB gzip, over the ${JS_BUDGET_GZIP_KB} kB budget (ADR-020).`);
    }
    this.info(`JS bundle: ${kb.toFixed(2)} / ${JS_BUDGET_GZIP_KB} kB gzip.`);
  },
});

export default defineConfig({
  plugins: [react(), contentSecurityPolicy(), bundleBudget()],
  build: {
    target: 'es2022',
    // No source maps in production: smaller install for low-storage phones.
    sourcemap: false,
    // Raw-size counterpart of the gzip budget, so Vite only warns once the budget is at risk.
    chunkSizeWarningLimit: 540,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
});
