import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': skip-waiting can swap the bundle out from
      // under a half-filled inspection form. The user gets a reload toast instead.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Quality Inspection Tracker',
        short_name: 'Inspections',
        description:
          'Log, track and resolve fabric quality defects from the shop floor.',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        // standalone reclaims the URL bar's vertical pixels on a 390px screen and
        // stops accidental pull-to-refresh mid-form.
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precaching the app shell is the ONLY reason we need a service worker.
        // IndexedDB already works without one; what a SW adds is that a cold load
        // or a pull-to-refresh while offline still boots the app instead of showing
        // the browser's offline page -- and on a phone that discards backgrounded
        // tabs, "reopen the app in a dead zone" IS a cold load.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Deliberately NO runtimeCaching for /api. Our IndexedDB layer already
        // caches API results at the repository seam with its own freshness rules;
        // a second HTTP-level cache would hand the repository a cached 200 it
        // could not tell apart from a fresh one, destroying the
        // network-error-vs-HTTP-error distinction the whole offline layer keys off.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Off in dev: a stale service worker is the number one cause of
        // "my change isn't showing up". Exercise it via `npm run build && preview`.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Shared by the dev server and `vite preview`, so the production build can be
  // exercised (including its service worker, which dev deliberately disables) against
  // the real API without reconfiguring anything.
  server: {
    // Reachable from outside the dev container, and from a phone on the LAN.
    host: true,
    proxy: {
      // Same-origin proxy rather than an absolute VITE_API_BASE_URL, for three
      // reasons: it removes CORS from the picture entirely (the backend's
      // `origin: ['*']` config was in fact broken, and a CORS rejection is
      // indistinguishable from being offline in JS); dev runs both apps in one
      // container so localhost:5000 is trivially correct; and testing on a real
      // phone then needs zero per-device configuration.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // No rewrite: the backend already serves under /api/v1.
      },
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
