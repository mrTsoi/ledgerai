// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Basic Vite + React + TS config
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
});
