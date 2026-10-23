import { defineConfig } from "@neon/config/v1";

// Deployment policy. Keep secrets out of source control; the Neon CLI reads these
// values from a protected local env file supplied with --env at deploy time.
export default defineConfig({
  functions: {
    asuransiapi: {
      name: "Asuransi Inteligen API",
      source: "server/src/neon-function.mjs",
      externalPackages: ["argon2"],
      env: {
        AUTH_ACCESS_TOKEN_SECRET: process.env.AUTH_ACCESS_TOKEN_SECRET,
        APP_ORIGIN: process.env.APP_ORIGIN,
        NEON_FUNCTION_RUNTIME: "1",
        NODE_ENV: "production"
      }
    }
  },
  // Runtime is per-branch tuning in the current Neon config schema.
  branch: () => ({
    functions: {
      asuransiapi: { runtime: "nodejs24" }
    }
  })
});
