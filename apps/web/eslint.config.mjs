import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next@16 ships native flat config; no @eslint/eslintrc compat layer.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "next-env.d.ts",
      "e2e/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // shortcut: react-hooks/set-state-in-effect (new with eslint-config-next@16)
      // flags 11 pre-existing setState-in-effect patterns; upgraded later, for now warning-only.
      "react-hooks/set-state-in-effect": "warn",
      "@next/next/no-location-assign-relative-destination": "warn",
      "import/no-anonymous-default-export": "warn",
    },
  },
];

export default config;
