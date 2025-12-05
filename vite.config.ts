// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Basic Vite + React + TS config
export default defineConfig({
  root: "src",
  plugins: [react()],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: true,
    lib: {
      entry: "main.tsx",
      name: "LedgerAIPreview",
      formats: ["es"],
      fileName: "bundle",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
    },
  },
});
