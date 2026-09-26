import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals, ...nextTs,
  // Media object URLs and provider SDK state are synchronized at effect boundaries.
  { rules: { "react-hooks/set-state-in-effect": "off" } },
  { files: ["scripts/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([".next/**", ".next-ios/**", ".ios-runtime/**", "data/**", "next-env.d.ts"]),
]);
