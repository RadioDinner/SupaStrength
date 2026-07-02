import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Serve dev + preview on :3000 to match Supabase Auth's default Site URL, so
  // magic-link / email-confirmation redirects land on the running app locally
  // with zero extra config. (On Vercel, set the Site URL to your domain.)
  server: { port: 3000 },
  preview: { port: 3000 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'SupaStrength',
        short_name: 'SupaStrength',
        description: 'Personalized strength training tracker',
        theme_color: '#0c0c0c',
        background_color: '#0c0c0c',
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
