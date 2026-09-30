import tailwindcss from "@tailwindcss/vite";
import subtext from "@usesubtext/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL,
  integrations: [subtext()],
  devToolbar: {
    enabled: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
