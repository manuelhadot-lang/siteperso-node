import { defineConfig } from "vite";

export default defineConfig({
  base: "/3D/geo/",
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
