import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main.jsx"),
      formats: ["iife"],
      fileName: () => "index.js",
      name: "{{LIB_GLOBAL}}",
    },
    /**
     * Optional: externalize react/react-dom once the platform bundles them globally.
     * rollupOptions: {
     *   external: ["react", "react-dom"],
     *   output: {
     *     globals: {
     *       react: "React",
     *       "react-dom": "ReactDOM",
     *     },
     *   },
     * },
     */
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: "assets/[name][extname]",
      },
    },
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 0,
    emptyOutDir: true,
    cssCodeSplit: false,
    copyPublicDir: false,
  },
  server: {
    port: {{DEV_PORT}},
    origin: "{{DEV_ORIGIN}}",
  },
  preview: {
    port: {{PREVIEW_PORT}},
  },
});
