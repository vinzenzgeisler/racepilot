import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Local development only: the browser talks same-origin and Vite forwards API routes.
const apiTarget = process.env.RACEPILOT_API_URL ?? 'http://127.0.0.1:3000';
const apiRoutes = ['/runtime', '/auth', '/admin', '/public', '/health'];
const isStatusPage = (pathname: string) =>
  pathname === '/registration/status' ||
  /^\/events\/[^/]+\/status\/?$/.test(pathname);
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'participant-status-security-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
          if (isStatusPage(pathname)) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Referrer-Policy', 'no-referrer');
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
          if (isStatusPage(pathname)) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Referrer-Policy', 'no-referrer');
          }
          next();
        });
      },
    },
  ],
  server: {
    proxy: Object.fromEntries(
      apiRoutes.map((route) => [
        route,
        { target: apiTarget, changeOrigin: false },
      ]),
    ),
  },
  test: { environment: 'jsdom' },
});
