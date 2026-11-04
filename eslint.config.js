import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'package-lock.json'] },
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
    files: [
      'packages/adapter-postgres/src/index.ts',
      'packages/api/src/index.ts',
      'packages/api/src/timing.ts',
      'packages/app/src/AdminEntries.tsx',
      'packages/app/src/AdminModules.tsx',
      'packages/app/src/AdminWorkflow.tsx',
      'packages/app/src/App.tsx',
      'packages/app/src/Registration.tsx',
      'packages/app/src/RegistrationFormSettings.tsx',
      'packages/contracts/src/index.ts',
      'packages/core/src/index.ts',
      'packages/core/src/modules.ts',
      'packages/ui/src/components.tsx',
      'packages/worker/src/mail.ts',
    ],
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['packages/app/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
);
