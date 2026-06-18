import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the POS posts to /api/iso8583 (same origin) and Vite forwards it
// to the Flossx83 switch on :8080, so there is no CORS issue and the backend
// needs no change. Override the target with SWITCH_URL if needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.SWITCH_URL || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
