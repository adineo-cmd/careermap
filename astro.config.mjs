import { defineConfig } from "astro/config";

export default defineConfig({
  base: process.env.COMPASS_BASE || "/compass/",
  build: { format: "file" },
});
