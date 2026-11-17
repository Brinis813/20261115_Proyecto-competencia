/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
    // Reparaciones de datos que se ejecutan una sola vez al arrancar (ver deuda de cobertura).
    '!src/db/repairs/**',
  ],
  // La política de cobertura vive en `.coverage-floors.json` y en `scripts/coverage-gate.mjs`.
  coverageReporters: ['text', 'json-summary'],
};
