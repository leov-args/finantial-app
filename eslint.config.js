// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries are enforced here, not only documented.
 * See docs/architecture.md ("Reglas de dependencia").
 *
 * @param {string[]} groups import globs that are forbidden
 * @param {string} message why
 */
const forbid = (groups, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'No se renderiza HTML no confiable. Usa texto plano.',
        },
      ],
    },
  },
  // ── Layer boundaries ────────────────────────────────────────────────
  {
    files: ['src/domain/**/*.ts'],
    rules: forbid(
      [
        '**/application/**',
        '**/infrastructure/**',
        '**/ui/**',
        '**/agent/**',
        '**/ocr/**',
        '**/storage/**',
        '**/app/**',
        'react',
        'react-dom',
        'dexie',
        'zod',
      ],
      'El dominio es TypeScript puro: no depende de capas externas, React, Dexie ni Zod.',
    ),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: forbid(
      ['**/infrastructure/**', '**/ui/**', '**/app/**', 'react', 'react-dom', 'dexie'],
      'La capa de aplicación depende de puertos (interfaces), no de Dexie ni de la UI.',
    ),
  },
  {
    files: ['src/agent/**/*.ts', 'src/ocr/**/*.ts'],
    rules: forbid(
      ['**/infrastructure/**', '**/ui/**', '**/app/**', 'react', 'react-dom', 'dexie'],
      'Agente y OCR no acceden a la base de datos ni a la UI; usan servicios de aplicación.',
    ),
  },
  {
    files: ['src/infrastructure/**/*.ts', 'src/storage/**/*.ts'],
    rules: forbid(
      ['**/ui/**', '**/app/**', 'react', 'react-dom'],
      'La infraestructura no conoce la UI.',
    ),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: forbid(
      ['**/infrastructure/**', 'dexie'],
      'La UI usa servicios de aplicación vía el composition root (src/app), nunca Dexie directamente.',
    ),
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
