// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { bootstrapWebApp } from "./bootstrap/web.js";
import { PosRouter } from "./router/Router.js";
import { readAccessToken } from "./offline/auth-session.js";
import { API_CONFIG } from "./shared/utils/constants.js";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

function App({ context }: { context: Awaited<ReturnType<typeof import("./bootstrap/web.js").createWebBootstrapContext>> }): JSX.Element {
  return <PosRouter context={context} />;
}

bootstrapWebApp({
  rootElement: root,
  AppComponent: App,
  config: {
    apiOrigin: API_CONFIG.baseUrl,
    accessToken: readAccessToken() ?? undefined,
    onPushError: (error) => {
      console.error("Sync push failed", error);
    }
  }
});
