/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
const JS_BUDGET_GZIP_KB = 200;

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

const SERVICE_WORKER_TEMPLATE = './src/pwa/sw.template.js';

async function collectFiles(dir: string, prefix: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const info = await stat(full);
    if (info.isDirectory()) {
      files.push(...(await collectFiles(full, relative)));
    } else {
      files.push(relative);
    }
  }
  return files;
}

async function hashFiles(root: string, files: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const file of files.toSorted()) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Emits a hand-written service worker at the site root. The worker precaches
 * every file in the build output (except itself) and a content hash of those
 * files becomes the cache version. Written in closeBundle so the precache list
 * can be derived from the final dist directory, including copied public files.
 */
const serviceWorker = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'family-finance:service-worker',
    apply: 'build',
    config(config) {
      outDir = config.build?.outDir ?? 'dist';
    },
    async closeBundle() {
      const root = path.resolve(outDir);
      const files = (await collectFiles(root, '')).filter((file) => file !== 'sw.js');
      const version = await hashFiles(root, files);
      const precache = JSON.stringify(files);
      const template = await readFile(SERVICE_WORKER_TEMPLATE, 'utf8');
      const source = template.replaceAll('__PRECACHE__', precache).replaceAll('__VERSION__', version);
      await writeFile(path.join(root, 'sw.js'), source);
      this.info(`Service worker ${version} precaches ${files.length} assets.`);
    },
  };
};

export default defineConfig({
  plugins: [react(), contentSecurityPolicy(), bundleBudget(), serviceWorker()],
  // Relative asset URLs: the build works under any subpath (GitHub Pages /<repo>/), ADR-021.
  base: './',
  build: {
    target: 'es2022',
    // No source maps in production: smaller install for low-storage phones.
    sourcemap: false,
    // Raw-size counterpart of the gzip budget, so Vite only warns once the budget is at risk.
    chunkSizeWarningLimit: 680,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
});
