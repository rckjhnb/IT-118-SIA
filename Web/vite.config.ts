import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API is the existing Express app. Keep the original Host header so the
// server's Origin/Host CSRF check matches the dev server the browser sees.
const backend = { target: 'http://127.0.0.1:3000', changeOrigin: false };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': backend, '/uploads': backend },
  },
});
