import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative base so Electron file:// loading and any web subpath deployment work seamlessly
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext'
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true
  }
});
