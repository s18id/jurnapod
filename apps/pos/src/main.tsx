import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main>
      <h1>Jurnapod POS</h1>
      <p>Offline-first scaffold ready (IndexedDB outbox to be implemented).</p>
    </main>
  );
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
