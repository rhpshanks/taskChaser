import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `/r` is the landing path for the three email buttons; proxying it means
    // the whole flow can be exercised end to end against the dev server.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/r': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
