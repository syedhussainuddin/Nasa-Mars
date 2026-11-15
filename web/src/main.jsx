import React from "react";
import { createRoot } from "react-dom/client";

// The designed app shell is introduced in Phase 2.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <main>
      <h1>Mars Navigation System</h1>
      <p>Application scaffold ready.</p>
    </main>
  </React.StrictMode>,
);
