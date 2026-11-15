/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      // the glob below already precaches every icon; avoid listing them twice
      includeManifestIcons: false,
      manifest: {
        name: 'Tab: split bills with friends',
        short_name: 'Tab',
        description: 'Split bills with friends. No account, no server, works offline.',
        lang: 'en-IN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F4EF',
        theme_color: '#16150F',
        categories: ['finance', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs ships in the precache, fonts included,
        // so it opens in airplane mode after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
