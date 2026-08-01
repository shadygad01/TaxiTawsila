/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  moduleNameMapper: {
    '^@taxitawsila/shared-contracts$': '<rootDir>/../../packages/shared-contracts/src/index.ts',
  },
};
