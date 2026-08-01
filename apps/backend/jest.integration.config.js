/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  moduleNameMapper: {
    '^@taxitawsila/shared-contracts$': '<rootDir>/../../packages/shared-contracts/src/index.ts',
    '^@taxitawsila/testing-utils$': '<rootDir>/../../packages/testing-utils/src/index.ts',
  },
  // Integration tests hit a real Postgres/Redis — see Testing Strategy §2 and
  // packages/testing-utils. Run sequentially (--runInBand, package.json
  // script) to avoid cross-test data races on shared tables.
};
