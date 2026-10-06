import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { target: 'esnext' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Obras', short_name: 'Obras', lang: 'pt-BR',
        description: 'Checklist e controle de gastos das obras',
        theme_color: '#000000', background_color: '#ffffff',
        display: 'standalone', start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,woff2}'] }
    })
  ]
});
