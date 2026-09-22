import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dashboard is a static bundle; the Node server serves it from dist/web.
export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080", "/media": "http://localhost:8080" },
  },
});
