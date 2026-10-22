import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite dev server (5173) proxies Socket.IO to the Node server (3001),
// so the browser sees a single origin and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
