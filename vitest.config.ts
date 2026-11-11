import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const workspaceSplitCss = readFileSync(
  new URL('./packages/ui/src/workspace/workspace-split.css', import.meta.url),
  'utf8',
);
const workspacePreviewToken =
  /\/\* --workspace-preview-breakpoint[^*]*\*\/\s*@media \((width\s*>=\s*[^)]+)\)/.exec(
    workspaceSplitCss,
  );
if (!workspacePreviewToken?.[1])
  throw new Error('Workspace preview breakpoint is missing from UI styles');
const workspacePreviewQuery = `(${workspacePreviewToken[1]})`;

const source = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  define: {
    __WORKSPACE_PREVIEW_QUERY__: JSON.stringify(workspacePreviewQuery),
  },
  resolve: {
    // Tests run against package sources so they do not depend on a prior build.
    alias: {
      '@racepilot/core': source('core'),
      '@racepilot/ui': source('ui'),
      '@racepilot/contracts': source('contracts'),
      '@racepilot/adapter-postgres': source('adapter-postgres'),
      '@racepilot/artifacts/pdf': fileURLToPath(
        new URL('./packages/artifacts/src/pdf.ts', import.meta.url),
      ),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
