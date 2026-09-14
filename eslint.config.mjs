import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { plugin as shadcn } from "@shadcn/lint";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { shadcn },
    rules: {
      "shadcn/no-restyle": "error",
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/require-static-classes": "error",
    },
  },
  {
    // PDF elements use Forme's point-based styles, not DOM/CSS properties.
    files: ["src/components/pdf/**/*.tsx", "src/lib/pdf-primitives.tsx"],
    rules: { "shadcn/no-inline-styles": "off" },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
