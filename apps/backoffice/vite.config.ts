import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/backoffice.svg"],
      manifest: {
        name: "Jurnapod Backoffice",
        short_name: "Jurnapod",
        description: "Modular ERP Backoffice",
        theme_color: "#2f5f4a",
        background_color: "#fcfbf8",
        display: "standalone",
        orientation: "any",
        icons: [
          {
            src: "icons/backoffice.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "icons/backoffice.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/accounts"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-accounts",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/account-types"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-account-types",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/items"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-items",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 12 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/item-prices"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-item-prices",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 12 * 60 * 60
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 3002,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  }
});
