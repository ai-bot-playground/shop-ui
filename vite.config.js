import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the shop-ui SPA. The dev server proxies /api to the gateway
// so local `npm run dev` mirrors the nginx setup used in the container.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
