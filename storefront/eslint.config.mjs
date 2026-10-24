import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// Next's recommended rules, minus style rules and the React Compiler rules
// (react-hooks v7) this codebase was never written against. Turning those on
// is a cleanup project of its own (~500 findings on 2026-10-24).
export default [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "public/**", "e2e/**"] },
]
