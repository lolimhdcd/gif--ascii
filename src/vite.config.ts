import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ⚠️ MUST MATCH THE HOMEPAGE PATH
export default defineConfig({
  base: "/gif--ascii/",
  plugins: [react()]
});
