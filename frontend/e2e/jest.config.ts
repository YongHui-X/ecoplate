import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: ['**/specs/**/*.spec.ts'],
  testTimeout: 60000,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'EcoPlate E2E Test Report',
        outputPath: './reports/test-report.html',
        includeFailureMsg: true,
        includeConsoleLog: true,
      },
    ],
  ],
  maxWorkers: 1,
};

export default config;
