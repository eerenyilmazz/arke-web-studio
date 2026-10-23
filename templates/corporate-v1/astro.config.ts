import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { clientFiles } from "./src/lib/integration";
import { requireEnv, siteUrl } from "./src/lib/env";

const site = siteUrl();

// Contract: read the client folder from ARKE_CLIENT_DIR, write a static site to ARKE_OUT_DIR. Nothing else.
export default defineConfig({
  output: "static",
  outDir: requireEnv("ARKE_OUT_DIR"),
  ...(site ? { site } : {}),
  trailingSlash: "always",
  build: { format: "directory" },
  compressHTML: true,
  devToolbar: { enabled: false },
  integrations: [clientFiles()],
  vite: { plugins: [tailwindcss()] },
});
