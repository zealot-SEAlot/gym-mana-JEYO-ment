/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    // Component tests render into jsdom, a browser page simulated inside Node
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
