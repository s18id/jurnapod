// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const posPort = parseInt(env.POS_PORT || "5173", 10);

  return {
    plugins: [react()],
    build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("ionicons")) {
            return "ionicons-vendor";
          }

          if (id.includes("@ionic/core/components/") || id.includes("@ionic/core/dist/collection/components/")) {
            return "ionic-core-components";
          }

          if (id.includes("@ionic/core/dist/") || id.includes("@ionic/core/internal/") || id.includes("@stencil/core/internal/")) {
            return "ionic-core-runtime";
          }

          if (id.includes("@ionic/core") || id.includes("@stencil")) {
            return "ionic-core-shared";
          }

          if (id.includes("@ionic/react")) {
            return "ionic-react-vendor";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          if (id.includes("react-router")) {
            return "router-vendor";
          }

          if (id.includes("dexie") || id.includes("idb")) {
            return "storage-vendor";
          }

          if (id.includes("@capacitor")) {
            return "capacitor-vendor";
          }

          if (id.includes("zod")) {
            return "validation-vendor";
          }

          return undefined;
        }
      }
    }
  },
    server: {
      port: posPort,
      proxy: {
        "/api": {
          target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3001",
          changeOrigin: true
        }
      }
    }
  };
});
