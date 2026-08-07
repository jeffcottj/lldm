import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    environment: "node",
    fileParallelism: false,
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    setupFiles: ["./test/no-network.ts"],
    sequence: {
      concurrent: false,
    },
  },
});
