module.exports = {
  preset: "jest-expo",
  rootDir: "../..",
  setupFiles: ["<rootDir>/tests/frontend/env.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/frontend/setup.ts"],
  testMatch: ["<rootDir>/tests/frontend/**/*.functional.test.ts?(x)"],
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  clearMocks: true,
};
