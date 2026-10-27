import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against package sources so they do not depend on a prior build.
    alias: {
      '@racepilot/core': source('core'),
      '@racepilot/contracts': source('contracts'),
      '@racepilot/adapter-postgres': source('adapter-postgres'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
