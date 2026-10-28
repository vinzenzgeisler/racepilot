import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(root, 'src/ui.tsx'),
      formats: ['es'],
      fileName: 'product',
      cssFileName: 'product',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@racepilot/contracts',
      ],
    },
    emptyOutDir: false,
    copyPublicDir: false,
  },
});
