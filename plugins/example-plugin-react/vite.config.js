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
      // REQUIRED for iife/umd builds:
      name: "ExamplePluginReact",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    outDir: "dist",
    assetsDir: "",
    emptyOutDir: true,
    copyPublicDir: false,
    // rollupOptions: {
    //   external: ["react", "react-dom"],
    //   output: {
    //     inlineDynamicImports: true,
    //     globals: {
    //       react: "React",
    //       "react-dom": "ReactDOM",
    //     },
    //   },
    // },
  },
  server: {
    port: 4002,
  },
  preview: {
    port: 8002,
  },

  /**
   * TODO: Uncomment rollupOptions, once configured platfrom to include react deps by default.
   * <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
   * <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
   */
});
