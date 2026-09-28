import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL,
  vite: {
    plugins: [tailwindcss()],
  },
});
