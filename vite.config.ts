import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        companion: resolve(__dirname, 'companion.html')
      }
    }
  }
});
