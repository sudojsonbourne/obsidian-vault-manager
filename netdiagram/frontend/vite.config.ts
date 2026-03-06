import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/upload': 'http://localhost:3000',
      '/status': 'http://localhost:3000',
      '/graph': 'http://localhost:3000',
    },
  },
  // Pre-bundle CJS packages so Vite resolves them correctly
  optimizeDeps: {
    include: ['cytoscape', 'react-cytoscapejs', 'cytoscape-cose-bilkent'],
  },
  // Preview mode: serve built dist/ on port 8080 with same proxy
  preview: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/upload': 'http://localhost:3000',
      '/status': 'http://localhost:3000',
      '/graph': 'http://localhost:3000',
    },
  },
});
