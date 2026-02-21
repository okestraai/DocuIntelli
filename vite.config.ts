// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // ✅ The correct target for a bolt.new environment is the internal service name,
        // not localhost, as services run in isolated containers.
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});