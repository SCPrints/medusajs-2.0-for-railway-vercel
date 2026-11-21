/** @type {import('jest').Config} */
module.exports = {
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2022",
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
  moduleNameMapper: {
    "^utils/(.*)$": "<rootDir>/src/utils/$1",
  },
  // pdfkit >= 0.21 pulls in fontkit 3, which ships ES modules only. Node 22
  // loads it fine at runtime; Jest's CommonJS sandbox needs it compiled.
  transformIgnorePatterns: [
    "/node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(fontkit|brotli|dfa|restructure|unicode-properties|unicode-trie|linebreak|png-js|@noble/ciphers|@noble/hashes|@swc/helpers)/)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/.medusa/", "/build/"],
}
