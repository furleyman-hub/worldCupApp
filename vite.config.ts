import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from the domain root at the custom domain worldcup2026.julianfox.com.
// (The old furleyman-hub.github.io/worldCupApp/ URL redirects there.)
const BASE = '/';

export default defineConfig({
  base: BASE,
  build: { target: 'es2017' },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['flags/*.svg', 'icons/*.png'],
      manifest: {
        name: 'World Cup 2026 Tracker',
        short_name: 'WC2026',
        description: '2026 FIFA World Cup schedule, results and family prediction pool',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#0d1b2a',
        theme_color: '#0d1b2a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'results-feed',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node'
  }
} as Parameters<typeof defineConfig>[0]);
