import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No volver a ejecutar las copias JavaScript emitidas por tsc en dist/.
    include: ["src/**/*.test.ts"],
  },
});
