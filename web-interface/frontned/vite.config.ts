import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'latex.js'], // Exclude latex.js from optimization
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true, // Enable mixed module transformation
    },
  },
  server: {
    fs: {
      // Allow serving files from these directories
      allow: ['..'],
    },
  },
});
