import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/gif--ascii/",
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
