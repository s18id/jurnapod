import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main>
      <h1>Jurnapod Backoffice</h1>
      <p>ERP admin scaffold ready.</p>
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
