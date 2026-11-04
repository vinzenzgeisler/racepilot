import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { readFileSync } from 'node:fs';

const maxLinesExceptions = JSON.parse(
  readFileSync(
    new URL('./scripts/max-lines-exceptions.json', import.meta.url),
    'utf8',
  ),
);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'package-lock.json',
      '**/*.css',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'max-lines': [
        'error',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ['**/*.test.*', '**/*.spec.*'],
    rules: { 'max-lines': 'off' },
  },
  {
    // Temporary, explicit legacy exceptions. Remove entries as files are refactored;
    // additions are rejected by scripts/check-max-lines.mjs.
    files: maxLinesExceptions,
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['packages/app/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
);
