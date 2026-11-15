import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";

export default defineConfig({
  plugins: [react()],
  define: {
    __MARS_LOCAL_ORTHO__: JSON.stringify(existsSync(new URL("./public/data/jezero_ortho.png", import.meta.url))),
  },
  optimizeDeps: {
    include: ["three", "three/addons/controls/OrbitControls.js", "leaflet"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
});
