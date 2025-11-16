import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";

const container = document.getElementById("plugin-root");

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
