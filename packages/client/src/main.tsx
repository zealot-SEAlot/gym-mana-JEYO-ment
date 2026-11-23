import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App.tsx";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html has no element with id root");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* Reads the address bar, so each screen has its own address and the back button works (KTD20) */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
