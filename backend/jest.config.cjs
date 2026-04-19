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
  testPathIgnorePatterns: ["/node_modules/", "/.medusa/", "/build/"],
}
