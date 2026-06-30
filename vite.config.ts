import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'SupaStrength',
        short_name: 'SupaStrength',
        description: 'Personalized strength training tracker',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // App-shell precache only for now. NO data caching — that's a Phase-2
        // decision, so we don't bake in a stale strategy.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
})
