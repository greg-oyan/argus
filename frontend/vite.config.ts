import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(projectDir, "..");
const docsExamplesDir = path.resolve(repoRoot, "docs", "examples").replace(/\\/g, "/");
const docsIndexPath = path.resolve(repoRoot, "docs", "index.html").replace(/\\/g, "/");

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __ARGUS_DEV_INDEX_URL__: JSON.stringify(`/@fs/${docsExamplesDir}/index.json`),
    __ARGUS_DEV_EXAMPLES_BASE_URL__: JSON.stringify(`/@fs/${docsExamplesDir}/`),
    __ARGUS_DEV_DEMO_URL__: JSON.stringify(`/@fs/${docsIndexPath}`),
  },
  build: {
    outDir: "../docs/workstation",
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
