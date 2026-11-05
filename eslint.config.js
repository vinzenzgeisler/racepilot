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

const nativeControlExceptions = JSON.parse(
  readFileSync(
    new URL('./scripts/native-control-exceptions.json', import.meta.url),
    'utf8',
  ),
);
const nativeControlSelectors = [
  ['button', 'Use @racepilot/ui Button instead of a raw button.'],
  [
    'input',
    'Use the appropriate @racepilot/ui input component instead of a raw input.',
  ],
  ['select', 'Use @racepilot/ui SelectField instead of a raw select.'],
  ['textarea', 'Use @racepilot/ui Textarea instead of a raw textarea.'],
  ['table', 'Use @racepilot/ui DataTable instead of a raw table.'],
].map(([name, message]) => ({
  selector: `JSXOpeningElement[name.name='${name}']`,
  message,
}));

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
  {
    files: ['packages/app/src/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...nativeControlSelectors] },
  },
  {
    files: nativeControlExceptions,
    rules: { 'no-restricted-syntax': 'off' },
  },
);
