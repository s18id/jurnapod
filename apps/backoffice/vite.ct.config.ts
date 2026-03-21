// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Simplified Vite config for component testing (no PWA plugin)
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 3101,
    strictPort: true,
  },
  build: {
    outDir: "dist-ct",
    sourcemap: true
  }
});