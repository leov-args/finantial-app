/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('PWA manifest', () => {
  it('has the required fields and every referenced icon exists', async () => {
    const raw = await readFile(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8');
    const manifest = JSON.parse(raw) as {
      name: string;
      display: string;
      start_url: string;
      scope: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };

    expect(manifest.name).toBe('Family Finance');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');

    const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
    expect(sizes.has('192x192')).toBe(true);
    expect(sizes.has('512x512')).toBe(true);

    const purposes = new Set(manifest.icons.map((icon) => icon.purpose ?? 'any'));
    expect(purposes.has('any')).toBe(true);
    expect(purposes.has('maskable')).toBe(true);

    for (const icon of manifest.icons) {
      expect(existsSync(new URL(`../../public/${icon.src}`, import.meta.url))).toBe(true);
    }
    expect(existsSync(new URL('../../public/apple-touch-icon.png', import.meta.url))).toBe(true);
  });
});
