import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      // Vite on 3001 so it doesn't collide with the Next.js API which the
      // `server/` package.json pins to port 3000.
      port: 3001,
      strictPort: false,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        // Trailing slash on '/audio/' is intentional — Vite's proxy uses
        // path.startsWith, and a bare '/audio' would also catch '/audiomass/…'
        // (our in-app waveform editor lives under public/audiomass/).
        '/audio/': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/editor': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/blog': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/demucs-web': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
