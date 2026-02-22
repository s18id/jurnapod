import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router";

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<AppRouter />);
