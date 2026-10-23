import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    asuransiapi: {
      name: "Asuransi Inteligen API",
      source: "server/src/neon-function.mjs",
      runtime: "nodejs24",
      externalPackages: ["argon2"]
    }
  }
});
