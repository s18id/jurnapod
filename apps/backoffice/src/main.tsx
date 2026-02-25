import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<AppRouter />);
