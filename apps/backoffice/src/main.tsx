// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/// <reference types="vite/client" />

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import { createRoot } from "react-dom/client";

import { AppRouter } from "./app/router";
import { ThemeProvider } from "./app/theme-provider";
import { QueryProvider } from "./lib/cache/query-client";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(
  <ThemeProvider>
    <QueryProvider>
      <AppRouter />
    </QueryProvider>
  </ThemeProvider>
);
