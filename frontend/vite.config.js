import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'seu-aims-production-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html;
        }
        return html.replace(
          /content="default-src 'self';[\s\S]*?form-action 'self'"/,
          `content="${PRODUCTION_CSP}"`,
        );
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
