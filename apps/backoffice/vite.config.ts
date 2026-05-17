// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { resolve } from "path";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim() || "http://localhost:3001";
  const backofficePort = parseInt(env.BACKOFFICE_PORT || "3002", 10);

  const plugins: PluginOption[] = [
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
        ...(mode === "report" ? { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 } : {}),
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
            urlPattern: ({ url }) => url.pathname.startsWith("/api/accounts/types"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-accounts-types",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/inventory/items"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-inventory-items",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 12 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/inventory/item-prices"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-inventory-item-prices",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 12 * 60 * 60
              }
            }
          }
        ]
      }
    })
  ];

  // Build report: add rollup-plugin-visualizer in report mode
  if (mode === "report") {
    const { visualizer } = await import("rollup-plugin-visualizer");
    plugins.push(
      visualizer({
        open: false,
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: backofficePort,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }

            if (
              id.includes("@mantine/hooks") ||
              id.includes("@mantine/notifications") ||
              id.includes("@floating-ui") ||
              id.includes("react") ||
              id.includes("scheduler")
            ) {
              return "mantine-core-vendor";
            }

            if (id.includes("@mantine/core")) {
              return "mantine-components-vendor";
            }

            if (id.includes("@mantine/dates") || id.includes("dayjs")) {
              return "mantine-dates-vendor";
            }

            if (id.includes("@tanstack/react-table")) {
              return "table-vendor";
            }

            if (id.includes("dexie") || id.includes("reconnecting-websocket")) {
              return "offline-vendor";
            }

            if (id.includes("marked") || id.includes("dompurify")) {
              return "content-vendor";
            }
            return undefined;
          }
        }
      }
    }
  };
});
