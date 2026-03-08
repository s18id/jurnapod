// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { IonApp, setupIonicReact } from "@ionic/react";
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "./theme/variables.css";
import { bootstrapWebApp, type WebBootstrapContext } from "./bootstrap/web.js";
import { bootstrapMobileApp, type MobileBootstrapContext } from "./bootstrap/mobile.js";
import { PosRouter } from "./router/Router.js";
import { readAccessToken } from "./offline/auth-session.js";
import { API_CONFIG } from "./shared/utils/constants.js";
import { isCapacitor } from "./shared/utils/platform.js";

setupIonicReact();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

// Union type for bootstrap context (web or mobile)
type BootstrapContext = WebBootstrapContext | MobileBootstrapContext;

function App({ context }: { context: BootstrapContext }): JSX.Element {
  return (
    <IonApp>
      <PosRouter context={context} />
    </IonApp>
  );
}

// Platform detection: use mobile bootstrap for Capacitor, web for browser
if (isCapacitor()) {
  console.log("Running in Capacitor mode (native mobile)");
  bootstrapMobileApp({
    rootElement: root,
    AppComponent: App as React.ComponentType<{ context: MobileBootstrapContext }>,
    config: {
      apiOrigin: API_CONFIG.baseUrl,
      accessToken: readAccessToken() ?? undefined,
      onPushError: (error) => {
        console.error("Sync push failed", error);
      }
    }
  });
} else {
  console.log("Running in Web/PWA mode");
  bootstrapWebApp({
    rootElement: root,
    AppComponent: App as React.ComponentType<{ context: WebBootstrapContext }>,
    config: {
      apiOrigin: API_CONFIG.baseUrl,
      accessToken: readAccessToken() ?? undefined,
      onPushError: (error) => {
        console.error("Sync push failed", error);
      }
    }
  });
}
