import { readFileSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
const workspaceSplitCss = readFileSync(
  new URL('../ui/src/workspace/workspace-split.css', import.meta.url),
  'utf8',
);
const workspacePreviewToken =
  /\/\* --workspace-preview-breakpoint[^*]*\*\/\s*@media \((width\s*>=\s*[^)]+)\)/.exec(
    workspaceSplitCss,
  );
if (!workspacePreviewToken?.[1])
  throw new Error('Workspace preview breakpoint is missing from UI styles');
const workspacePreviewQuery = `(${workspacePreviewToken[1]})`;

// Local development only: the browser talks same-origin and Vite forwards API routes.
const apiTarget = process.env.RACEPILOT_API_URL ?? 'http://127.0.0.1:3000';
// The OIDC callback must be served by the SPA, not forwarded to the API.
const apiRoutes = ['/runtime', '/auth/config', '/admin', '/public', '/health'];

export default defineConfig({
  define: {
    __WORKSPACE_PREVIEW_QUERY__: JSON.stringify(workspacePreviewQuery),
  },
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      apiRoutes.map((route) => [
        route,
        { target: apiTarget, changeOrigin: false },
      ]),
    ),
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
