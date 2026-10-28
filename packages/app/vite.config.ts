import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Local development only: the browser talks same-origin and Vite forwards API routes.
const apiTarget = process.env.RACEPILOT_API_URL ?? 'http://127.0.0.1:3000';
const apiRoutes = ['/runtime', '/auth', '/admin', '/public', '/health'];

export default defineConfig({
  plugins: [react()],
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
