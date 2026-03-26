import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: resolve(__dirname, '../media'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'lecture.html'),
      },
    },
  },
});
